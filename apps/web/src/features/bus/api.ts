import type { BoardingKind, BusDriverOption, BusStopPoint, DriverHome, DriverTrip, FamilyBus, LiveBus, StartTripInput, StopLocationsInput, TripSummary } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useCan, useHasFeature } from '@/lib/auth-store';

/** Live bus tracking. Coordinates only ever travel in bodies, never in URLs. */
export const bk = {
  all: ['bus'] as const,
  home: ['bus', 'driver-home'] as const,
  trip: (id: string) => ['bus', 'trip', id] as const,
  family: (studentId: string) => ['bus', 'family', studentId] as const,
  live: ['bus', 'live'] as const,
  trips: (date: string) => ['bus', 'trips', date] as const,
  drivers: ['bus', 'drivers'] as const,
};

export function useDriverHome() {
  return useQuery({ queryKey: bk.home, queryFn: ({ signal }) => api.get<DriverHome>('/bus/driver/home', undefined, signal), refetchInterval: 60_000 });
}

export function useDriverTrip(id: string | null) {
  return useQuery({
    queryKey: bk.trip(id ?? ''),
    queryFn: ({ signal }) => api.get<DriverTrip>(`/bus/trips/${id}/driver`, undefined, signal),
    enabled: !!id,
    // The assistant may be tapping students on another phone.
    refetchInterval: 20_000,
  });
}

export function useStartTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartTripInput) => api.post<DriverTrip>('/bus/trips', input),
    onSuccess: (t) => {
      qc.setQueryData(bk.trip(t.id), t);
      void qc.invalidateQueries({ queryKey: bk.home });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBoard(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: string; kind: BoardingKind }) => api.post<DriverTrip>(`/bus/trips/${tripId}/boarding`, input),
    onSuccess: (t) => qc.setQueryData(bk.trip(t.id), t),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useEndTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/bus/trips/${id}/end`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: bk.all }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** A parent's view of their child's bus: polls while a trip runs, slowly otherwise. */
export function useFamilyBus(studentId: string) {
  const has = useHasFeature('transport');
  return useQuery({
    queryKey: bk.family(studentId),
    queryFn: ({ signal }) => api.get<FamilyBus>(`/bus/family/${studentId}`, undefined, signal),
    enabled: has && !!studentId,
    refetchInterval: (q) => (q.state.data?.live ? 10_000 : q.state.data?.rides ? 60_000 : false),
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useLiveBuses() {
  const can = useCan('transport.read');
  return useQuery({ queryKey: bk.live, queryFn: ({ signal }) => api.get<LiveBus[]>('/bus/live', undefined, signal), enabled: can, refetchInterval: 10_000 });
}

export function useTrips(date: string) {
  const can = useCan('transport.read');
  return useQuery({ queryKey: bk.trips(date), queryFn: ({ signal }) => api.get<TripSummary[]>('/bus/trips', { date }, signal), enabled: can, refetchInterval: 30_000 });
}

export function useStopTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/bus/trips/${id}/stop`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: bk.all });
      toast.success('Trip ended; location sharing stopped');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBusDrivers(enabled: boolean) {
  const can = useCan('transport.manage');
  return useQuery({ queryKey: bk.drivers, queryFn: ({ signal }) => api.get<BusDriverOption[]>('/bus/drivers', undefined, signal), enabled: enabled && can, staleTime: 60_000 });
}

export function useSaveStopLocations(routeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StopLocationsInput) => api.put<BusStopPoint[]>(`/bus/routes/${routeId}/stops`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'transport'] });
      void qc.invalidateQueries({ queryKey: bk.all });
      toast.success('Stop locations saved');
    },
  });
}
