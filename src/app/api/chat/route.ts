import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Stored in-memory for a single session (will reset if server restarts)
let meetingDetails: {
    attendee?: string;
    date?: string;
    time?: string;
    duration?: string;
    purpose?: string;
} = {};

export async function POST(req: Request) {
    try {
        // We now expect { conversation: Message[], isInitial: boolean }
        // where conversation is an array of { role: 'user' | 'assistant', content: string }
        const { conversation = [], isInitial } = await req.json();

        // Decide which system prompt to use
        const systemPrompt = isInitial
            ? `You are a professional AI assistant who is capable of both answering general inquiries
         and helping to schedule meetings via Calendly. Always respond in JSON format,
         keeping your responses brief, formal, and friendly. If no input is received,
         respond with a formal greeting that asks if the user needs help scheduling a meeting.
         For a greeting, use the following JSON format:
         { "type": "greeting", "response": "your message" }`
            : `You are a professional AI assistant who is capable of both answering general inquiries
         and scheduling meetings. Analyze the user's message:
         - If the message contains meeting scheduling information, extract the following details (if provided):
           attendee, date, time, duration (default 30), purpose
         - If the message is a general inquiry (not meeting-related), answer directly in a brief, formal, friendly manner.

         When the message pertains to scheduling a meeting, use the current meeting details:
         ${JSON.stringify(meetingDetails)}
         and respond in JSON using:
         {
           "type": "meeting_request",
           "details": {
             "attendee": "...",
             "date": "...",
             "time": "...",
             "duration": "...",
             "purpose": "..."
           },
           "missingInfo": ["..."],
           "response": "a brief formal message asking only for the missing information"
         }

         If the message is unrelated to scheduling, respond in JSON with:
         {
           "type": "general_response",
           "response": "your brief formal answer"
         }

         Always maintain professionalism and be helpful.
      `;

        // 1) Construct the messages array
        const messages = [
            { role: "system", content: systemPrompt },
            // conversation is an array of { role: 'user'|'assistant', content: string }
            ...conversation,
        ];

        let aiResponse: string | null = null;

        // 2) Send to OpenAI
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages,
                max_tokens: 200,
                // If your version of the openai library supports response_format:
                response_format: { type: "json_object" }
            });

            aiResponse = completion.choices[0].message.content;
            if (!aiResponse) {
                return NextResponse.json({
                    response: "I apologize, but I couldn't process your request. Please try again."
                });
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error('OpenAI API error:', err);
            return NextResponse.json(
                { error: 'Failed to get AI response', details: err.message },
                { status: 500 }
            );
        }

        // 3) If it's not the initial prompt, parse the JSON and handle scheduling logic
        if (!isInitial) {
            try {
                const parsedResponse = JSON.parse(aiResponse);

                // Meeting request?
                if (parsedResponse.type === "meeting_request" && parsedResponse.details) {
                    // Merge new details with existing in-memory details
                    meetingDetails = { ...meetingDetails, ...parsedResponse.details };

                    // If we have all details, check availability
                    if (parsedResponse.missingInfo && parsedResponse.missingInfo.length === 0) {
                        const isAvailable = await checkAvailability(
                            meetingDetails.date!,
                            meetingDetails.time!,
                            parseInt(meetingDetails.duration || '30')
                        );
                        if (!isAvailable) {
                            return NextResponse.json({
                                response: "The requested time slot is not available. Please choose another date or time."
                            });
                        }
                        // If available, schedule via Calendly
                        const calendlyResponse = await createOneOffEvent(meetingDetails);
                        if (calendlyResponse.schedulingUrl) {
                            parsedResponse.response += `\n\nI've scheduled your meeting. You can find the details here: ${calendlyResponse.schedulingUrl}`;
                            // Clear meeting details after scheduling
                            meetingDetails = {};
                        }
                    }
                    return NextResponse.json({ response: parsedResponse.response });
                }
                // General response or greeting
                else if (parsedResponse.type === "general_response" || parsedResponse.type === "greeting") {
                    return NextResponse.json({ response: parsedResponse.response });
                }
                // Unknown format
                else {
                    return NextResponse.json({
                        response: "Invalid response from the AI assistant. Please try again."
                    });
                }
            } catch (error) {
                console.error('Error parsing AI response:', error);
                return NextResponse.json({
                    response: "Error processing the response. Please try again."
                });
            }
        }

        // 4) For the initial request, just return the AI's raw response or the parsed "response" property
        return NextResponse.json({
            response: isInitial ? aiResponse : JSON.parse(aiResponse).response
        });
    } catch (error) {
        console.error('OpenAI API error:', error);
        return NextResponse.json(
            { error: 'Failed to get AI response' },
            { status: 500 }
        );
    }
}

// ------------------
// Availability Check
// ------------------
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

            // If our requested window overlaps the event window, it's not available
            if (
                (requestedStart >= eventStart && requestedStart < eventEnd) ||
                (requestedEnd > eventStart && requestedEnd <= eventEnd) ||
                (requestedStart <= eventStart && requestedEnd >= eventEnd)
            ) {
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error("Availability check error:", error);
        return false;
    }
}

// -------------------
// Create One-Off Event
// -------------------
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

// ------------------
// Parse Duration
// ------------------
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
