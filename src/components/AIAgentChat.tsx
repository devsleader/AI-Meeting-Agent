'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const avatarVariants = {
  idle: { scale: 1 },
  listening: {
    scale: [1, 1.05, 1],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
  thinking: {
    scale: [1, 0.95, 1],
    rotate: [0, -1, 1, -1, 0],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
  speaking: {
    scale: [1, 1.02, 1],
    transition: { duration: 0.5, repeat: Infinity, ease: 'easeOut' },
  },
};

const statusIndicatorVariants = {
  idle: { scale: 1 },
  active: {
    scale: [1, 1.2, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function AIAgentChat() {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [conversation, setConversation] = useState<Message[]>([]);
  const [hasGreeted, setHasGreeted] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    speechSynthesisRef.current = window.speechSynthesis;
    return () => {
      stopAll();
    };
  }, []);

  const stopAll = () => {
    // console.log('[STOP_ALL] => Cancelling TTS, stopping recognition, resetting state.');
    if (speechSynthesisRef.current?.speaking) {
      speechSynthesisRef.current.cancel();
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    setAgentState('idle');
    setTranscript('');
    setResponse('');
    setConversation([]);
    setHasGreeted(false);
  };

  const speakText = (text: string) => {
    const synth = speechSynthesisRef.current;
    if (!synth) {
      console.warn('[TTS] Not supported in this browser.');
      return;
    }
    // console.log('[TTS] Starting =>', text);

    setAgentState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      // console.log('[TTS] onstart => AI is speaking...');
    };
    utterance.onerror = (err) => {
      console.error('[TTS] onerror =>', err);
      if (agentState !== 'idle') {
        setAgentState('listening');
      }
    };
    utterance.onend = () => {
      // console.log('[TTS] onend => Finished speaking');
      if (agentState !== 'idle') {
        setAgentState('listening');
      }
    };
    synth.speak(utterance);
  };

  const handleUserInput = useCallback(
    async (input: string) => {
      try {
        // console.log('[USER_INPUT] =>', input);
        setTranscript(input);

        // Switch to "thinking"
        setAgentState('thinking');

        const updatedConversation = [...conversation, { role: 'user', content: input }];
        setConversation(updatedConversation);

        // Fetch AI response
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: updatedConversation,
            isInitial: false,
          }),
        });

        if (!res.ok) throw new Error('Failed to get AI response');
        const data = await res.json();

        setResponse(data.response);
        setConversation((prev) => [...prev, { role: 'assistant', content: data.response }]);

        speakText(data.response);
      } catch (error) {
        console.error('[AI] Error =>', error);
        stopAll();
      }
    },
    [conversation, agentState]
  );

  const startListening = () => {
    // console.log('[START_LISTENING] => Pressed start...');
    if (!recognitionRef.current) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error('[SR] Not supported in this browser.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onstart = () => {
        // console.log('[SR] onstart => Microphone is active (always).');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (agentState === 'speaking' || agentState === 'thinking') {
          return;
        }
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const { transcript } = event.results[i][0];
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          }
        }
        if (finalTranscript.trim()) {
          const userInput = finalTranscript.trim();
          finalTranscript = '';
          setTranscript('');
          handleUserInput(userInput);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          console.warn('[SR] onerror => no-speech, but continuing...');
        } else {
          console.error('[SR] onerror =>', event.error);
        }
      };

      recognition.onend = () => {
        // console.log('[SR] onend => The mic turned off unexpectedly. Restarting if not idle...');
        if (agentState !== 'idle') {
          recognition.start();
        }
      };

      recognitionRef.current = recognition;
    }

    if (!hasGreeted) {
      // console.log('[GREETING] => first time greeting...');
      setAgentState('speaking');
      const greeting = 'Hello! How can I help you today?';
      setResponse(greeting);

      const synth = speechSynthesisRef.current;
      if (synth) {
        const utterance = new SpeechSynthesisUtterance(greeting);
        utterance.onstart = () => {
          // console.log('[TTS] greeting => onstart...');
        };
        utterance.onend = () => {
          // console.log('[TTS] greeting => onend, now always listening...');
          setHasGreeted(true);
          setAgentState('listening');
          recognitionRef.current?.start();
        };
        synth.speak(utterance);
      }
    } else {
      // console.log('[START_LISTENING] => Already greeted, now always listening...');
      setAgentState('listening');
      recognitionRef.current?.start();
    }
  };

  const toggle = () => {
    if (agentState === 'idle') {
      startListening();
    } else {
      stopAll();
    }
  };

  return (
    <div className="h-full w-full bg-gradient-to-b from-indigo-500/10 to-purple-500/10 rounded-xl relative overflow-hidden">
      <div className="absolute top-8 left-8 z-10">
        <motion.div
          className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <motion.div
            className={`h-3 w-3 rounded-full ${agentState === 'idle'
              ? 'bg-gray-400'
              : agentState === 'listening'
                ? 'bg-green-500'
                : agentState === 'thinking'
                  ? 'bg-yellow-500'
                  : 'bg-blue-500'
              }`}
            variants={statusIndicatorVariants}
            animate={agentState === 'idle' ? 'idle' : 'active'}
          />
          <span className="text-sm font-medium capitalize">
            {agentState === 'idle'
              ? 'Idle'
              : agentState === 'listening'
                ? 'Listening'
                : agentState === 'thinking'
                  ? 'Thinking'
                  : 'Speaking'}
          </span>
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
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white font-medium shadow-lg cursor-pointer ${agentState === 'idle'
          ? 'bg-indigo-500 hover:bg-indigo-600'
          : 'bg-red-500 hover:bg-red-600'
          }`}
        whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.95, transition: { duration: 0.1 } }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        onClick={toggle}
      >
        {agentState === 'idle' ? 'Start Speaking' : 'Stop 🛑'}
      </motion.button>

      <AnimatePresence mode="wait">
        {(transcript || response) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-lg px-4"
          >
            <div className="backdrop-blur-sm p-4 rounded-lg shadow-lg"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.5)" }}
            >
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