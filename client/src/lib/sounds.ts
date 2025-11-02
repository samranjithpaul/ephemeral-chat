// Simple sound effect system using Web Audio API
class SoundManager {
  private audioContext: AudioContext | null = null;

  constructor() {
    // Initialize audio context on first interaction
    if (typeof window !== "undefined") {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playTone(frequency: number, duration: number, volume: number = 0.1) {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + duration
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  playClick() {
    this.playTone(800, 0.05, 0.08);
  }

  playMessageSent() {
    this.playTone(600, 0.1, 0.1);
    setTimeout(() => this.playTone(800, 0.1, 0.1), 50);
  }

  playMessageReceived() {
    this.playTone(500, 0.15, 0.12);
  }

  playJoin() {
    this.playTone(700, 0.1, 0.1);
    setTimeout(() => this.playTone(900, 0.1, 0.1), 80);
  }

  playLeave() {
    this.playTone(600, 0.1, 0.1);
    setTimeout(() => this.playTone(400, 0.1, 0.1), 80);
  }

  playError() {
    this.playTone(300, 0.2, 0.15);
  }
}

export const soundManager = new SoundManager();
