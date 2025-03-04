'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const avatarVariants = {
  idle: {
    scale: 1,
    transition: {
      duration: 2,
      ease: "easeInOut"
    }
  },
  listening: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      times: [0, 0.5, 1],
      repeat: Infinity,
      ease: "easeInOut"
    }
  },
  thinking: {
    scale: [1, 0.95, 1],
    rotate: [0, -1, 1, -1, 0],
    transition: {
      duration: 2,
      times: [0, 0.25, 0.5, 0.75, 1],
      repeat: Infinity,
      ease: "easeInOut"
    }
  },
  speaking: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 0.5,
      repeat: Infinity,
      ease: "easeOut"
    }
  }
};

const statusIndicatorVariants = {
  idle: {
    scale: 1,
  },
  active: {
    scale: [1, 1.2, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function AIAgentChat() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [response, setResponse] = useState('');
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const recognitionRef = useRef<any>(null);
  const noInputTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleUserInput = useCallback(async (input: string, isInitial: boolean = false) => {
    try {
      setAgentState('thinking');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input, isInitial }),
      });

      if (!response.ok) throw new Error('Failed to get AI response');

      const data = await response.json();
      setAgentState('speaking');
      setResponse(data.response);
      speakResponse(data.response);
    } catch (error) {
      console.error('Error getting AI response:', error);
      setAgentState('idle');
    }
  }, []);

  useEffect(() => {
    speechSynthesisRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (noInputTimeoutRef.current) {
        clearTimeout(noInputTimeoutRef.current);
      }
    };
  }, [handleUserInput]);

  const speakResponse = (
    text: string,
    resetAfterSpeaking: boolean = true,
    onEnd?: () => void
  ) => {
    if (!speechSynthesisRef.current) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      if (resetAfterSpeaking) {
        setAgentState('idle');
        setResponse('');
      }
      if (onEnd) {
        onEnd();
      }
    };
    speechSynthesisRef.current.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';
    let greetingSent = false; // Track if the greeting has already been spoken
    let noInputTimer: number | null = null;

    const clearNoInputTimer = () => {
      if (noInputTimer !== null) {
        clearTimeout(noInputTimer);
        noInputTimer = null;
      }
    };

    // Set a 5-second timer that is not active during speaking.
    const setNoInputTimer = () => {
      clearNoInputTimer();
      noInputTimer = window.setTimeout(() => {
        if (!greetingSent) {
          // First 5-second timeout: No input detected; speak the greeting.
          greetingSent = true;
          setAgentState('speaking');
          speakResponse(
            'Hi, how are you? I am here to assist you in scheduling a meeting.',
            false, // Do not reset state on speaking end.
            () => {
              // Only start waiting again after the greeting finishes speaking.
              setNoInputTimer();
            }
          );
        } else {
          // Second 5-second timeout after greeting: No further input; stop listening.
          recognition.stop();
          setAgentState('idle');
          setIsListening(false);
        }
      }, 5000);
    };

    recognition.onstart = () => {
      setAgentState('listening');
      setIsListening(true);
      setNoInputTimer();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Whenever some speech is detected, clear the no-input timer.
      clearNoInputTimer();

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      setTranscript(finalTranscript);

      if (finalTranscript.trim()) {
        // Final user input detected: stop recognition and process the input.
        recognition.stop();
        handleUserInput(finalTranscript.trim());
        return;
      }

      // If no final input is yet available, restart the timer.
      setNoInputTimer();
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      clearNoInputTimer();
      setIsListening(false);
      setAgentState('idle');
    };

    recognition.onend = () => {
      clearNoInputTimer();
      setIsListening(false);
      setAgentState('idle');
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="h-full w-full bg-gradient-to-b from-indigo-500/10 to-purple-500/10 rounded-xl relative overflow-hidden">
      <div className="absolute top-8 left-8 z-10">
        <motion.div
          className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.div
            className={`h-3 w-3 rounded-full ${agentState === 'idle' ? 'bg-gray-400' :
              agentState === 'listening' ? 'bg-green-500' :
                agentState === 'thinking' ? 'bg-yellow-500' :
                  'bg-blue-500'
              }`}
            variants={statusIndicatorVariants}
            animate={agentState === 'idle' ? 'idle' : 'active'}
          />
          <span className="text-sm font-medium capitalize">{agentState}</span>
        </motion.div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="w-64 h-64 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full opacity-80 shadow-2xl"
          variants={avatarVariants}
          animate={agentState}
          initial="idle"
        />
      </div>

      <motion.button
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white font-medium shadow-lg cursor-pointer ${isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
          }`}
        whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.95, transition: { duration: 0.1 } }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        onClick={startListening}
      >
        {isListening ? 'Listening...' : 'Start Speaking'}
      </motion.button>

      <AnimatePresence mode="wait">
        {(transcript || response) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-lg px-4"
          >
            <div className="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg">
              {transcript && (
                <p className="text-gray-700 mb-2">
                  <span className="font-medium">You:</span> {transcript}
                </p>
              )}
              {response && (
                <p className="text-gray-700">
                  <span className="font-medium">Assistant:</span> {response}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
} 