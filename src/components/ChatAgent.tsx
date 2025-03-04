'use client'

import { useEffect, useState } from 'react'

export default function ChatAgent() {
    const [transcript, setTranscript] = useState('')

    useEffect(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

        if (!SpeechRecognition) {
            console.warn('Speech Recognition API not supported in this browser.')
            return
        }

        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const speechResult = event.results[0][0].transcript
            setTranscript(speechResult)

            if (speechResult.toLowerCase().includes('schedule my meeting')) {
                window.location.href = '/schedule'
            }
        }

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error)
        }

        recognition.start()

        return () => {
            recognition.stop()
        }
    }, [])

    return (
        <div className="p-4 bg-white rounded shadow">
            <p className="mb-2 font-medium">Heard:</p>
            <p className="text-blue-600">{transcript}</p>
        </div>
    )
}
