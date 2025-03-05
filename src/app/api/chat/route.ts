import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

let meetingDetails: {
    attendee?: string;
    date?: string;
    time?: string;
    duration?: string;
    purpose?: string;
} = {};

export async function POST(req: Request) {
    try {
        const { message, isInitial } = await req.json();

        let systemPrompt = isInitial
            ? "You are a professional AI assistant who is capable of both answering general inquiries and helping to schedule meetings via Calendly. Always respond in JSON format, keeping your responses brief, formal, and friendly. If no input is received, respond with a formal greeting that asks if the user needs help scheduling a meeting. For a greeting, use the following JSON format: { \"type\": \"greeting\", \"response\": \"your message\" }"
            : `You are a professional AI assistant who is capable of both answering general inquiries and scheduling meetings. Analyze the user's message:
            - If the message contains meeting scheduling information, extract the following details (if provided): 
            - attendee (name of person to meet with)
            - date (meeting date)
            - time (meeting time)
            - duration (meeting duration, default is 30 minutes)
            - purpose (meeting agenda/purpose)
            - If the message is a general inquiry (i.e., not meeting related), answer the question directly in a brief, formal, and friendly manner.

            When the message pertains to scheduling a meeting, use the current meeting details: ${JSON.stringify(meetingDetails)} and respond in JSON using the following format:
            {
            "type": "meeting_request",
            "details": {
                "attendee": "extracted or existing attendee name",
                "date": "extracted or existing date",
                "time": "extracted or existing time",
                "duration": "extracted or existing duration",
                "purpose": "extracted or existing purpose"
            },
            "missingInfo": ["list of still missing required information"],
            "response": "a brief formal message asking only for the missing information"
            }

            If the message is a general inquiry unrelated to scheduling a meeting, respond in JSON using this format:
            {
            "type": "general_response",
            "response": "your brief formal answer"
            }

            Always maintain professionalism and be helpful.`;

        let aiResponse: string | null = null;

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message || "No input received" }
                ],
                max_tokens: 200,
                response_format: { type: "json_object" }
            });

            aiResponse = completion.choices[0].message.content;
            if (!aiResponse) {
                return NextResponse.json({ response: "I apologize, but I couldn't process your request. Please try again." });
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error('OpenAI API error:', err);
            return NextResponse.json(
                { error: 'Failed to get AI response', details: err.message },
                { status: 500 }
            );
        }

        if (!isInitial) {
            try {
                const parsedResponse = JSON.parse(aiResponse);
                if (parsedResponse.type === "meeting_request" && parsedResponse.details) {
                    meetingDetails = { ...meetingDetails, ...parsedResponse.details };

                    if (parsedResponse.missingInfo && parsedResponse.missingInfo.length === 0) {
                        const isAvailable = await checkAvailability(
                            meetingDetails.date!,
                            meetingDetails.time!,
                            parseInt(meetingDetails.duration || '30')
                        );
                        if (!isAvailable) {
                            return NextResponse.json({ response: "The requested time slot is not available. Please choose another date or time." });
                        }
                        // const calendlyResponse = await createCalendlyEvent(meetingDetails);
                        const calendlyResponse = await createOneOffEvent(meetingDetails);
                        if (calendlyResponse.schedulingUrl) {
                            parsedResponse.response += `\n\nI've scheduled your meeting. You can find the details here: ${calendlyResponse.schedulingUrl}`;
                            meetingDetails = {};
                        }
                    }
                    return NextResponse.json({ response: parsedResponse.response });
                } else if (parsedResponse.type === "general_response" || parsedResponse.type === "greeting") {
                    return NextResponse.json({ response: parsedResponse.response });
                } else {
                    return NextResponse.json({ response: "Invalid response from the AI assistant. Please try again." });
                }
            } catch (error) {
                console.error('Error parsing AI response:', error);
                return NextResponse.json({ response: "Error processing the response. Please try again." });
            }
        }

        return NextResponse.json({ response: isInitial ? aiResponse : JSON.parse(aiResponse).response });
    } catch (error) {
        console.error('OpenAI API error:', error);
        return NextResponse.json(
            { error: 'Failed to get AI response' },
            { status: 500 }
        );
    }
}

async function checkAvailability(date: string, time: string, duration: number = 30): Promise<boolean> {
    try {
        const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
        const CALENDLY_USER_URI = process.env.CALENDLY_USER_URI;
        if (!CALENDLY_API_KEY || !CALENDLY_USER_URI) {
            console.error("Missing Calendly API credentials");
            return false;
        }

        const minStartTime = `${date}T00:00:00Z`;
        const maxStartTime = `${date}T23:59:59Z`;

        const url = new URL("https://api.calendly.com/scheduled_events");
        url.searchParams.append("user", CALENDLY_USER_URI);
        url.searchParams.append("min_start_time", minStartTime);
        url.searchParams.append("max_start_time", maxStartTime);
        url.searchParams.append("status", "active");

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CALENDLY_API_KEY}`
            }
        });
        if (!response.ok) {
            console.error("Failed to fetch scheduled events:", await response.text());
            return false;
        }

        const data = await response.json();
        const requestedStart = new Date(`${date}T${time}`);
        const requestedEnd = new Date(requestedStart);
        requestedEnd.setMinutes(requestedEnd.getMinutes() + duration);

        for (const event of data.collection) {
            if (event.status !== "active") continue;

            const eventStart = new Date(event.start_time);
            const eventEnd = new Date(event.end_time);

            if ((requestedStart >= eventStart && requestedStart < eventEnd) ||
                (requestedEnd > eventStart && requestedEnd <= eventEnd) ||
                (requestedStart <= eventStart && requestedEnd >= eventEnd)) {
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error("Availability check error:", error);
        return false;
    }
}

async function createOneOffEvent(details: {
    attendee?: string;
    date?: string;
    time?: string;
    duration?: string;
    purpose?: string;
}): Promise<{ schedulingUrl?: string; error?: string; details?: string }> {
    try {
        const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
        const CALENDLY_USER_URI = process.env.CALENDLY_USER_URI;
        if (!CALENDLY_API_KEY || !CALENDLY_USER_URI) {
            return { error: 'Missing Calendly API credentials' };
        }

        const dateRange = details.date || "2025-01-01";
        const durationMinutes = parseDurationString(details.duration);

        const eventName = details.purpose || "One-Off Meeting";

        const locationPayload = {
            kind: "physical",
            location: "Office",
            additonal_info: ""
        };

        const createResponse = await fetch("https://api.calendly.com/one_off_event_types", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CALENDLY_API_KEY}`
            },
            body: JSON.stringify({
                name: eventName,
                host: CALENDLY_USER_URI,
                duration: durationMinutes,
                timezone: "Etc/UTC",
                date_setting: {
                    type: "date_range",
                    start_date: dateRange,
                    end_date: dateRange
                },
                location: locationPayload
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error("Failed to create one-off event type:", errorText);
            return { error: "Failed to create one-off event type", details: errorText };
        }
        const createdEventTypeData = await createResponse.json();
        const schedulingUrl = createdEventTypeData.resource?.scheduling_url;

        if (!schedulingUrl) {
            return { error: "No scheduling URL returned by Calendly." };
        }

        return { schedulingUrl };
    } catch (error: unknown) {
        const err = error as Error;
        console.error("Calendly API error:", err);
        return { error: "Failed to create one-off event type", details: err.message };
    }
}

function parseDurationString(durationStr: string | undefined): number {
    if (!durationStr) return 30;

    const lower = durationStr.toLowerCase().trim();
    const directNum = parseInt(lower, 10);

    if (lower.includes("hour") || lower.includes("hr")) {
        return directNum >= 1 ? directNum * 60 : 30;
    }
    if (lower.includes("min")) {
        return directNum >= 5 ? directNum : 30;
    }
    if (!isNaN(directNum) && directNum > 0) {
        return directNum < 5 ? 5 : directNum;
    }
    return 30;
}