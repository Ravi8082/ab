import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { seedCities, seedEvents, seedTickets } from '@/data/seed';
import type { CityItem, Coupon, EventItem, TicketType, TierCard } from '@/types';

export function useLiveData() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [tierCards, setTierCards] = useState<TierCard[]>([]);
  const [coupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setEvents(seedEvents);
      setTickets(seedTickets);
      setCities(seedCities);
      setLoading(false);
      return;
    }

    async function load() {
      const [evRes, tkRes, ciRes, tcRes] = await Promise.all([
        supabase.from('events').select('*').eq('status', 'live'),
        supabase.from('ticket_types').select('*').eq('active', true),
        supabase.from('cities').select('*').eq('active', true),
        supabase.from('tier_cards').select('*').eq('active', true).order('sort_order'),
      ]);

      if (!active) return;

      setEvents(evRes.data as EventItem[] ?? []);
      setTickets(tkRes.data as TicketType[] ?? []);
      setCities(ciRes.data as CityItem[] ?? []);
      setTierCards(tcRes.data as TierCard[] ?? []);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel('public-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_types' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cities' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tier_cards' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { events, tickets, cities, tierCards, coupons, loading };
}
