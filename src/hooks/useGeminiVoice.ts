import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult extends ArrayLike<SpeechAlternative> {
  isFinal: boolean;
}

interface SpeechResultEvent extends Event {
  results: ArrayLike<SpeechResult>;
}

interface SpeechErrorEvent extends Event {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const getVoiceErrorMessage = (code: string) => {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Allow microphone access in your browser to use voice mode.';
  }
  if (code === 'audio-capture') return 'No microphone is available. Connect or enable a microphone, then try again.';
  if (code === 'network') return 'Voice recognition could not connect. Check your connection and try again.';
  if (code === 'no-speech') return 'No speech was detected. Turn voice mode off and on to try again.';
  return 'Voice input failed. Check your microphone permission and try again.';
};

export const useGeminiVoice = () => {
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptHandlerRef = useRef<((transcript: string) => void) | null>(null);
  const voiceModeRef = useRef(false);

  const startListening = useCallback(() => {
    if (!voiceModeRef.current || recognitionRef.current) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceError('Voice input is not supported in this browser. Try a current version of Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal && result[0]?.transcript) transcript.push(result[0].transcript);
      }
      const text = transcript.join(' ').trim();
      if (text) transcriptHandlerRef.current?.(text);
      recognition.stop();
    };
    recognition.onerror = (event) => {
      setVoiceError(getVoiceErrorMessage(event.error));
      voiceModeRef.current = false;
      setVoiceMode(false);
      setIsListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceError('Could not start voice input. Check microphone permission and try again.');
    }
  }, []);

  const enableVoiceMode = useCallback((onTranscript: (transcript: string) => void) => {
    if (!('speechSynthesis' in window)) {
      setVoiceError('Spoken replies are not supported in this browser.');
      return;
    }
    transcriptHandlerRef.current = onTranscript;
    voiceModeRef.current = true;
    setVoiceMode(true);
    setVoiceError(null);
    startListening();
  }, [startListening]);

  const disableVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setIsListening(false);
    setIsSpeaking(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const speakReply = useCallback((text: string) => {
    if (!voiceModeRef.current || !('speechSynthesis' in window)) return;
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>]/g, ' ').replace(/\s+/g, ' ').trim()
    );
    utterance.onend = () => {
      setIsSpeaking(false);
      startListening();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setVoiceError('Gemini replied, but your browser could not speak the response.');
    };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [startListening]);

  useEffect(() => () => {
    voiceModeRef.current = false;
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  return {
    voiceMode,
    isListening,
    isSpeaking,
    voiceError,
    enableVoiceMode,
    disableVoiceMode,
    speakReply,
  };
};
