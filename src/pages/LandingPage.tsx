import { useSmoothScroll } from '@/hooks/useSmoothScroll';
import { useApp } from '@/context/AppContext';
import { useLiveData } from '@/hooks/useLiveData';
import Hero from '@/components/3d/Hero';
import Sundarkand from '@/components/Sundarkand';
import Expo from '@/components/Expo';
import FinalCTA from '@/components/FinalCTA';
import MyBooking from '@/components/MyBooking';
import WhatsAppButton from '@/components/WhatsAppButton';
import RegistrationModal from '@/components/RegistrationModal';
import Confirmation from '@/components/Confirmation';
import { useState } from 'react';
import type { CityItem, TicketType } from '@/types';
import type { BookingResult } from '@/lib/booking';

interface ConfirmationState {
  booking: BookingResult;
  name: string;
  persons: number;
  ticketLabel: string;
  eventName: string;
  eventDate: string;
  eventVenue: string;
  city?: { city: string; state: string };
}

export default function LandingPage() {
  useSmoothScroll();
  useApp();
  const { tickets, cities, tierCards } = useLiveData();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityItem | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  const liveTickets = tickets.length > 0 ? tickets : [];
  const liveCities = cities.length > 0 ? cities : [];

  const openRegistration = (ticket: TicketType, city?: CityItem) => {
    setSelectedTicket(ticket);
    setSelectedCity(city ?? null);
    setModalOpen(true);
  };

  const handleConfirmed = (booking: BookingResult, details: Omit<ConfirmationState, 'booking'>) => {
    setConfirmation({ booking, ...details });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <main>
        <Hero />
        <Sundarkand onRegister={openRegistration} tickets={liveTickets} cities={liveCities} />
        <Expo onRegister={openRegistration} tickets={liveTickets} tierCards={tierCards} />
        <MyBooking />
        <FinalCTA />
      </main>
      <WhatsAppButton />
      <RegistrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ticket={selectedTicket}
        preselectedCity={selectedCity}
        cities={liveCities}
        onConfirmed={handleConfirmed}
      />
      {confirmation && (
        <Confirmation
          booking={confirmation.booking}
          event={{ name: confirmation.eventName, date: confirmation.eventDate, venue: confirmation.eventVenue }}
          ticket={{ label: confirmation.ticketLabel }}
          city={confirmation.city}
          persons={confirmation.persons}
          name={confirmation.name}
          onClose={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}
