import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

// Define your tracks here
const TRACKS = ['/ambient-1.mp3', '/ambient-2.mp3'];

interface AudioContextType {
  isMuted: boolean;
  currentTrackIndex: number;
  toggleAudio: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // Start muted by default, or load their previous preference
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('hft_muted');
    return saved ? JSON.parse(saved) : true; // Default is true (muted)
  });
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Handle the play/pause state whenever isMuted or the track changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.15; // Golden rule: Keep it VERY quiet (15%)
      
      if (isMuted) {
        audioRef.current.pause();
      } else {
        // Play returns a promise, catch it to prevent browser auto-play errors
        audioRef.current.play().catch(e => console.log("Audio play blocked:", e));
      }
    }
    localStorage.setItem('hft_muted', JSON.stringify(isMuted));
  }, [isMuted, currentTrackIndex]);

  // The logic to cycle: Mute -> Track 1 -> Track 2 -> Mute
  const toggleAudio = () => {
    if (isMuted) {
      // If muted, unmute and play the current track
      setIsMuted(false);
    } else {
      // If playing, check if there's another track
      if (currentTrackIndex < TRACKS.length - 1) {
        setCurrentTrackIndex(prev => prev + 1); // Go to next track
      } else {
        // If at the end of the playlist, mute and reset to track 1
        setIsMuted(true);
        setCurrentTrackIndex(0);
      }
    }
  };

  return (
    <AudioContext.Provider value={{ isMuted, currentTrackIndex, toggleAudio }}>
      {/* The hidden audio engine */}
      <audio 
        ref={audioRef} 
        src={TRACKS[currentTrackIndex]} 
        loop 
      />
      {children}
    </AudioContext.Provider>
  );
}

// Custom hook to use the audio anywhere in your app
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within an AudioProvider");
  return context;
}