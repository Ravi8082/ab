import { MessageCircle } from 'lucide-react';
import { WHATSAPP_NUMBER } from '@/data/seed';

export default function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-40 group"
      aria-label="Chat on WhatsApp"
    >
      {/* Ripple rings */}
      <div className="absolute inset-0 rounded-full bg-green-500/30 animate-ripple" />
      <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ripple" style={{ animationDelay: '1.5s' }} />
      {/* Breathing glow */}
      <div className="absolute inset-0 rounded-full bg-green-500/40 blur-lg animate-breathe" />
      <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 group-hover:scale-110 transition-transform duration-300 ease-smooth">
        <MessageCircle size={26} className="text-white" />
      </div>
    </a>
  );
}
