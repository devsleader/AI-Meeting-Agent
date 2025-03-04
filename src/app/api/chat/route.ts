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
                        const isAvailable = await checkAvailability(meetingDetails.date, meetingDetails.time);
                        if (!isAvailable) {
                            return NextResponse.json({ response: "The requested time slot is not available. Please choose another date or time." });
                        }
                        const calendlyResponse = await createCalendlyEvent(meetingDetails);
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

async function checkAvailability(date?: string, time?: string): Promise<boolean> {
    try {
        if (!process.env.CALENDLY_API_KEY || !process.env.CALENDLY_EVENT_TYPE_URI) {
            console.error('Missing Calendly API credentials');
            return false;
        }

        const startTime = `${date}T00:00:00Z`;
        const endTime = `${date}T23:59:59Z`;

        const url = new URL('https://api.calendly.com/scheduled_events');
        url.searchParams.append('user', process.env.CALENDLY_USER_URI || '');
        url.searchParams.append('min_start_time', startTime);
        url.searchParams.append('max_start_time', endTime);
        url.searchParams.append('status', 'active');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CALENDLY_API_KEY}`
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch scheduled events:', await response.text());
            return false;
        }

        const scheduledEvents = await response.json();

        const requestedTimeStart = new Date(`${date}T${time}`);
        const requestedTimeEnd = new Date(requestedTimeStart);
        requestedTimeEnd.setMinutes(requestedTimeEnd.getMinutes() + (parseInt(meetingDetails.duration || '30')));

        for (const event of scheduledEvents.collection) {
            const eventStart = new Date(event.start_time);
            const eventEnd = new Date(event.end_time);

            if ((requestedTimeStart >= eventStart && requestedTimeStart < eventEnd) ||
                (requestedTimeEnd > eventStart && requestedTimeEnd <= eventEnd) ||
                (requestedTimeStart <= eventStart && requestedTimeEnd >= eventEnd)) {
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Availability check error:', error);
        return false;
    }
}

async function createCalendlyEvent(details: {
    attendee?: string;
    date?: string;
    time?: string;
    duration?: string;
    purpose?: string;
}): Promise<{ schedulingUrl?: string; eventType?: string; error?: string; details?: string }> {
    try {
        if (!process.env.CALENDLY_API_KEY || !process.env.CALENDLY_USER_URI) {
            return { error: 'Missing Calendly API credentials' };
        }

        const eventTypeResponse = await fetch('https://api.calendly.com/event_types', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CALENDLY_API_KEY}`
            }
        });

        if (!eventTypeResponse.ok) {
            console.error('Failed to fetch event types:', await eventTypeResponse.text());
            return { error: 'Failed to fetch Calendly event types' };
        }

        const eventTypesData = await eventTypeResponse.json();
        const eventType = eventTypesData.collection[0];

        if (!eventType) {
            return { error: 'No event types found' };
        }

        const response = await fetch('https://api.calendly.com/scheduling_links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CALENDLY_API_KEY}`
            },
            body: JSON.stringify({
                max_event_count: 1,
                owner: process.env.CALENDLY_USER_URI,
                owner_type: 'users',
                event_type: eventType.uri,
                custom_questions: [
                    { name: "Meeting Purpose", type: "text", position: 0, required: true, answer: details.purpose || 'Discussion' },
                    { name: "Attendee Name", type: "text", position: 1, required: true, answer: details.attendee || 'Guest' }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Calendly API error response:', errorText);
            return { error: 'Failed to create Calendly event', details: errorText };
        }

        const data = await response.json();

        return {
            schedulingUrl: data.resource.booking_url,
            eventType: eventType.name
        };
    } catch (error: any) {
        console.error('Calendly API error:', error);
        return {
            error: 'Failed to create meeting link',
            details: error.message
        };
    }
}