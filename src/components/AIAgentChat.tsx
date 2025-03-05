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
    if (agentState !== 'idle') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';
    let hasUserSpoken = false;
    let waitingTimer: number | null = null;

    const clearWaitingTimer = () => {
      if (waitingTimer !== null) {
        clearTimeout(waitingTimer);
        waitingTimer = null;
      }
    };
    const afterGreeting = () => {
      setAgentState('listening');
      setIsListening(true);
      recognition.start();
      waitingTimer = window.setTimeout(() => {
        if (!hasUserSpoken) {
          recognition.stop();
          setAgentState('idle');
          setIsListening(false);
        }
      }, 5000);
    };

    setAgentState('speaking');
    speakResponse(
      'Hi, how are you? I am here to assist you in scheduling a meeting.',
      false,
      () => {
        afterGreeting();
      }
    );

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      clearWaitingTimer();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      setTranscript(finalTranscript);

      if (finalTranscript.trim()) {
        hasUserSpoken = true;
        recognition.stop();
        handleUserInput(finalTranscript.trim()).then(() => {
          finalTranscript = '';
          recognition.start();
          setAgentState('listening');
          waitingTimer = window.setTimeout(() => {
            if (!hasUserSpoken) {
              recognition.stop();
              setAgentState('idle');
              setIsListening(false);
            }
          }, 5000);
        });
      } else {
        waitingTimer = window.setTimeout(() => {
          if (!hasUserSpoken) {
            recognition.stop();
            setAgentState('idle');
            setIsListening(false);
          }
        }, 5000);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        console.log('No speech detected.');
        return;
      }
      console.error('Speech recognition error:', event.error);
      clearWaitingTimer();
      setIsListening(false);
      setAgentState('idle');
    };

    recognition.onend = () => {
      clearWaitingTimer();
      if (!hasUserSpoken) {
        setIsListening(false);
        setAgentState('idle');
      }
    };
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
        disabled={agentState !== 'idle'}
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white font-medium shadow-lg cursor-pointer ${isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
          }`}
        whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.95, transition: { duration: 0.1 } }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        onClick={() => {
          if (agentState === 'idle') {
            startListening();
          }
        }}
      >
        {agentState === 'idle' ? 'Start Speaking' : 'Listening...'}
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