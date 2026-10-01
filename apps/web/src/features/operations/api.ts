import type {
  AiEnquiryReply,
  AiText,
  BookCategory,
  BookInput,
  BookRow,
  CertificateInput,
  CertificateKind,
  CertificateRow,
  CertificateView,
  EnquiryInput,
  EnquiryRow,
  EnquiryStatus,
  ExeatInput,
  ExeatRow,
  HostelInput,
  HostelOverview,
  IdCardBatch,
  InventoryCategory,
  InventoryItemInput,
  InventoryItemRow,
  InventoryOverview,
  IssueLoanInput,
  LibraryOverview,
  LoanRow,
  OperationsOverview,
  OperationsSettings,
  Paginated,
  PickupInput,
  PickupRow,
  PublicVerification,
  ReadingList,
  ReceptionToday,
  RouteDetail,
  RouteNotice,
  RouteRow,
  StockMovementInput,
  StockMovementRow,
  TransportOverview,
  TransportRouteInput,
  VehicleInput,
  VehicleRow,
  VisitorInput,
  VisitorRow,
  AiCertificate,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { aiErrorMessage } from '../finance/api';

export type LoanStatusFilter = 'OUT' | 'OVERDUE' | 'RETURNED' | 'ALL';

export interface BookListParams {
  q?: string;
  category?: BookCategory;
  available?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export interface LoanListParams {
  status?: LoanStatusFilter;
  studentId?: string;
  staffId?: string;
  bookId?: string;
}

export interface ItemListParams {
  q?: string;
  category?: InventoryCategory;
  low?: 'true';
  assets?: 'true' | 'false';
}

export interface VisitorListParams {
  from?: string;
  to?: string;
  q?: string;
}

export interface EnquiryListParams {
  status?: EnquiryStatus | 'OPEN';
  q?: string;
}

/** Query keys — everything operations lives under ['ops']. */
export const ok = {
  all: ['ops'] as const,
  settings: ['ops', 'settings'] as const,
  overview: ['ops', 'overview'] as const,
  library: ['ops', 'library'] as const,
  libraryOverview: ['ops', 'library', 'overview'] as const,
  books: (p: BookListParams) => ['ops', 'library', 'books', p] as const,
  loans: (p: LoanListParams) => ['ops', 'library', 'loans', p] as const,
  inventory: ['ops', 'inventory'] as const,
  inventoryOverview: ['ops', 'inventory', 'overview'] as const,
  items: (p: ItemListParams) => ['ops', 'inventory', 'items', p] as const,
  movements: (itemId?: string) => ['ops', 'inventory', 'movements', itemId ?? null] as const,
  transport: ['ops', 'transport'] as const,
  transportOverview: ['ops', 'transport', 'overview'] as const,
  vehicles: ['ops', 'transport', 'vehicles'] as const,
  routes: ['ops', 'transport', 'routes'] as const,
  route: (id: string) => ['ops', 'transport', 'route', id] as const,
  hostel: ['ops', 'hostel'] as const,
  hostelOverview: ['ops', 'hostel', 'overview'] as const,
  exeats: (status: 'OUT' | 'ALL') => ['ops', 'hostel', 'exeats', status] as const,
  reception: ['ops', 'reception'] as const,
  receptionToday: (date?: string) => ['ops', 'reception', 'today', date ?? null] as const,
  visitors: (p: VisitorListParams) => ['ops', 'reception', 'visitors', p] as const,
  enquiries: (p: EnquiryListParams) => ['ops', 'reception', 'enquiries', p] as const,
  pickups: (studentId?: string) => ['ops', 'reception', 'pickups', studentId ?? null] as const,
  documents: ['ops', 'documents'] as const,
  certificates: (p: { kind?: CertificateKind; q?: string }) => ['ops', 'documents', 'certificates', p] as const,
  certificate: (id: string) => ['ops', 'documents', 'certificate', id] as const,
  idCards: (p: object) => ['ops', 'documents', 'id-cards', p] as const,
};

/** Something in a module changed: refresh that module, the operations card and the dashboard. */
function invalidate(scope: readonly string[]) {
  void queryClient.invalidateQueries({ queryKey: scope });
  void queryClient.invalidateQueries({ queryKey: ok.overview });
}

const aiError = { meta: { silent: true }, onError: (err: Error) => toast.error(aiErrorMessage(err)) } as const;

// ------------------------------------------------------------------ settings & dashboard

export function useOperationsSettings(enabled = true) {
  const can = useCan('school.read');
  return useQuery({
    queryKey: ok.settings,
    queryFn: ({ signal }) => api.get<OperationsSettings>('/operations/settings', undefined, signal),
    enabled: enabled && can,
    staleTime: 5 * 60_000,
  });
}

export function useSaveOperationsSettings() {
  return useMutation({
    mutationFn: (input: OperationsSettings) => api.put<OperationsSettings>('/operations/settings', input),
    meta: { silent: true },
    onSuccess: (s) => {
      queryClient.setQueryData(ok.settings, s);
      void queryClient.invalidateQueries({ queryKey: ok.library });
      toast.success('Settings saved');
    },
  });
}

export function useOperationsOverview(enabled = true) {
  return useQuery({
    queryKey: ok.overview,
    queryFn: ({ signal }) => api.get<OperationsOverview>('/operations/overview', undefined, signal),
    enabled,
    staleTime: 60_000,
  });
}

// ------------------------------------------------------------------ library

export function useLibraryOverview() {
  const can = useCan('library.read');
  return useQuery({
    queryKey: ok.libraryOverview,
    queryFn: ({ signal }) => api.get<LibraryOverview>('/library/overview', undefined, signal),
    enabled: can,
  });
}

export function useBooks(params: BookListParams, enabled = true) {
  const can = useCan('library.read');
  return useQuery({
    queryKey: ok.books(params),
    queryFn: ({ signal }) => api.get<Paginated<BookRow>>('/library/books', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useSaveBook(id?: string) {
  return useMutation({
    mutationFn: (input: BookInput) => (id ? api.put<BookRow>(`/library/books/${id}`, input) : api.post<BookRow>('/library/books', input)),
    meta: { silent: true },
    onSuccess: (b) => {
      invalidate(ok.library);
      toast.success(id ? `“${b.title}” updated` : `“${b.title}” added to the catalogue`);
    },
  });
}

export function useDeleteBook() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/library/books/${id}`),
    onSuccess: () => {
      invalidate(ok.library);
      toast.success('Book removed from the catalogue');
    },
  });
}

export function useLoans(params: LoanListParams, enabled = true) {
  const can = useCan('library.read');
  return useQuery({
    queryKey: ok.loans(params),
    queryFn: ({ signal }) => api.get<LoanRow[]>('/library/loans', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useIssueLoan() {
  return useMutation({
    mutationFn: (input: IssueLoanInput) => api.post<LoanRow>('/library/loans', input),
    meta: { silent: true },
    onSuccess: (l) => {
      invalidate(ok.library);
      toast.success(`“${l.book.title}” lent to ${l.borrower.name}`);
    },
  });
}

export function useReturnLoan() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; fineKobo?: number; finePaid: boolean; note: string | null }) => api.post<LoanRow>(`/library/loans/${id}/return`, body),
    meta: { silent: true },
    onSuccess: (l) => {
      invalidate(ok.library);
      toast.success(`“${l.book.title}” returned`);
    },
  });
}

export function useRenewLoan() {
  return useMutation({
    mutationFn: (id: string) => api.post<LoanRow>(`/library/loans/${id}/renew`),
    onSuccess: (l) => {
      invalidate(ok.library);
      toast.success(`Renewed until ${l.dueOn}`);
    },
  });
}

export function useFinePaid() {
  return useMutation({
    mutationFn: (id: string) => api.post<LoanRow>(`/library/loans/${id}/fine-paid`),
    onSuccess: (l) => {
      invalidate(ok.library);
      toast.success(`Fine settled for ${l.borrower.name}`);
    },
  });
}

export function useReadingList() {
  return useMutation({
    mutationFn: (input: { audience: string; topic?: string; count: number }) => api.post<ReadingList>('/library/reading-list', input),
    ...aiError,
  });
}

// ------------------------------------------------------------------ inventory

export function useInventoryOverview() {
  const can = useCan('inventory.read');
  return useQuery({
    queryKey: ok.inventoryOverview,
    queryFn: ({ signal }) => api.get<InventoryOverview>('/inventory/overview', undefined, signal),
    enabled: can,
  });
}

export function useItems(params: ItemListParams) {
  const can = useCan('inventory.read');
  return useQuery({
    queryKey: ok.items(params),
    queryFn: ({ signal }) => api.get<InventoryItemRow[]>('/inventory/items', { ...params }, signal),
    enabled: can,
    placeholderData: keepPreviousData,
  });
}

export function useMovements(itemId: string | undefined) {
  return useQuery({
    queryKey: ok.movements(itemId),
    queryFn: ({ signal }) => api.get<StockMovementRow[]>('/inventory/movements', { itemId }, signal),
    enabled: !!itemId,
  });
}

export function useSaveItem(id?: string) {
  return useMutation({
    mutationFn: (input: InventoryItemInput) => (id ? api.put<InventoryItemRow>(`/inventory/items/${id}`, input) : api.post<InventoryItemRow>('/inventory/items', input)),
    meta: { silent: true },
    onSuccess: (i) => {
      invalidate(ok.inventory);
      toast.success(id ? `${i.name} updated` : `${i.name} added to stores`);
    },
  });
}

export function useDeleteItem() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/items/${id}`),
    onSuccess: () => {
      invalidate(ok.inventory);
      toast.success('Item removed from stores');
    },
  });
}

export function useMoveStock(itemId: string) {
  return useMutation({
    mutationFn: (input: StockMovementInput) => api.post<StockMovementRow>(`/inventory/items/${itemId}/movements`, input),
    meta: { silent: true },
    onSuccess: (m) => {
      invalidate(ok.inventory);
      if (m.expenseRecorded) void queryClient.invalidateQueries({ queryKey: ['finance'] });
      const verb = m.kind === 'IN' ? 'Received' : m.kind === 'OUT' ? 'Issued' : 'Count saved for';
      toast.success(`${verb} ${m.item.name} — ${m.balanceAfter.toLocaleString()} ${m.item.unit} on hand${m.expenseRecorded ? ' · expense recorded in Finance' : ''}`);
    },
  });
}

export function useInventoryInsight() {
  return useMutation({ mutationFn: () => api.post<AiText>('/inventory/insight'), ...aiError });
}

// ------------------------------------------------------------------ transport

export function useTransportOverview() {
  const can = useCan('transport.read');
  return useQuery({
    queryKey: ok.transportOverview,
    queryFn: ({ signal }) => api.get<TransportOverview>('/transport/overview', undefined, signal),
    enabled: can,
  });
}

export function useVehicles(enabled = true) {
  const can = useCan('transport.read');
  return useQuery({
    queryKey: ok.vehicles,
    queryFn: ({ signal }) => api.get<VehicleRow[]>('/transport/vehicles', undefined, signal),
    enabled: enabled && can,
  });
}

export function useSaveVehicle(id?: string) {
  return useMutation({
    mutationFn: (input: VehicleInput) => (id ? api.put<unknown>(`/transport/vehicles/${id}`, input) : api.post<unknown>('/transport/vehicles', input)),
    meta: { silent: true },
    onSuccess: (_r, v) => {
      invalidate(ok.transport);
      toast.success(id ? `${v.name} updated` : `${v.name} added`);
    },
  });
}

export function useDeleteVehicle() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transport/vehicles/${id}`),
    onSuccess: () => {
      invalidate(ok.transport);
      toast.success('Vehicle removed');
    },
  });
}

export function useRoute(id: string | undefined) {
  return useQuery({
    queryKey: ok.route(id ?? ''),
    queryFn: ({ signal }) => api.get<RouteDetail>(`/transport/routes/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useSaveRoute(id?: string) {
  return useMutation({
    mutationFn: (input: TransportRouteInput) => (id ? api.put<RouteRow>(`/transport/routes/${id}`, input) : api.post<RouteRow>('/transport/routes', input)),
    meta: { silent: true },
    onSuccess: (r) => {
      invalidate(ok.transport);
      toast.success(id ? `${r.name} updated` : `Route ${r.name} added`);
    },
  });
}

export function useDeleteRoute() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transport/routes/${id}`),
    onSuccess: () => {
      invalidate(ok.transport);
      toast.success('Route removed');
    },
  });
}

export function useAssignRiders() {
  return useMutation({
    mutationFn: (input: { studentIds: string[]; routeId: string; stop: string; direction: 'BOTH' | 'MORNING' | 'AFTERNOON' }) => api.post<RouteDetail>('/transport/assignments', input),
    meta: { silent: true },
    onSuccess: (r, v) => {
      queryClient.setQueryData(ok.route(r.id), r);
      invalidate(ok.transport);
      toast.success(`${v.studentIds.length === 1 ? '1 rider' : `${v.studentIds.length} riders`} added to ${r.name} at ${v.stop}`);
    },
  });
}

export function useRemoveRider() {
  return useMutation({
    mutationFn: (assignmentId: string) => api.delete(`/transport/assignments/${assignmentId}`),
    onSuccess: () => {
      invalidate(ok.transport);
      toast.success('Rider taken off the route');
    },
  });
}

export function useRouteNotice(routeId: string) {
  return useMutation({
    mutationFn: (situation: string) => api.post<RouteNotice>(`/transport/routes/${routeId}/notice`, { situation }),
    ...aiError,
  });
}

// ------------------------------------------------------------------ hostel

export function useHostelOverview() {
  const can = useCan('hostel.read');
  return useQuery({
    queryKey: ok.hostelOverview,
    queryFn: ({ signal }) => api.get<HostelOverview>('/hostel/overview', undefined, signal),
    enabled: can,
  });
}

export function useExeats(status: 'OUT' | 'ALL', enabled = true) {
  const can = useCan('hostel.read');
  return useQuery({
    queryKey: ok.exeats(status),
    queryFn: ({ signal }) => api.get<ExeatRow[]>('/hostel/exeats', { status }, signal),
    enabled: enabled && can,
  });
}

export function useSaveHostel(id?: string) {
  return useMutation({
    mutationFn: (input: HostelInput) => (id ? api.put<unknown>(`/hostel/hostels/${id}`, input) : api.post<unknown>('/hostel/hostels', input)),
    meta: { silent: true },
    onSuccess: (_r, v) => {
      invalidate(ok.hostel);
      toast.success(id ? `${v.name} updated` : `${v.name} added`);
    },
  });
}

export function useDeleteHostel() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/hostel/hostels/${id}`),
    onSuccess: () => {
      invalidate(ok.hostel);
      toast.success('Hostel removed');
    },
  });
}

export function useSaveRoom(hostelId: string, roomId?: string) {
  return useMutation({
    mutationFn: (input: { name: string; beds: number }) => (roomId ? api.put<unknown>(`/hostel/rooms/${roomId}`, input) : api.post<unknown>(`/hostel/hostels/${hostelId}/rooms`, input)),
    meta: { silent: true },
    onSuccess: (_r, v) => {
      invalidate(ok.hostel);
      toast.success(roomId ? `${v.name} updated` : `Room ${v.name} added`);
    },
  });
}

export function useDeleteRoom() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/hostel/rooms/${id}`),
    onSuccess: () => {
      invalidate(ok.hostel);
      toast.success('Room removed');
    },
  });
}

export function useAllocate() {
  return useMutation({
    mutationFn: (input: { studentId: string; roomId: string; bed: number | null }) => api.post<unknown>('/hostel/allocations', input),
    meta: { silent: true },
    onSuccess: () => invalidate(ok.hostel),
  });
}

export function useEndAllocation() {
  return useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/hostel/allocations/${id}/end`),
    onSuccess: () => {
      invalidate(ok.hostel);
      toast.success('Bed freed up');
    },
  });
}

export function useSignOutExeat() {
  return useMutation({
    mutationFn: (input: ExeatInput) => api.post<ExeatRow>('/hostel/exeats', input),
    meta: { silent: true },
    onSuccess: (e) => {
      invalidate(ok.hostel);
      toast.success(`${e.student.name} signed out with ${e.collectedBy}`);
    },
  });
}

export function useExeatReturn() {
  return useMutation({
    mutationFn: (id: string) => api.post<ExeatRow>(`/hostel/exeats/${id}/return`),
    onSuccess: (e) => {
      invalidate(ok.hostel);
      toast.success(`${e.student.name} is back`);
    },
  });
}

// ------------------------------------------------------------------ reception

export function useReceptionToday(date?: string) {
  const can = useCan('reception.read');
  return useQuery({
    queryKey: ok.receptionToday(date),
    queryFn: ({ signal }) => api.get<ReceptionToday>('/reception/today', { date }, signal),
    enabled: can,
    refetchInterval: 60_000,
  });
}

export function useVisitors(params: VisitorListParams, enabled = true) {
  const can = useCan('reception.read');
  return useQuery({
    queryKey: ok.visitors(params),
    queryFn: ({ signal }) => api.get<VisitorRow[]>('/reception/visitors', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useSignInVisitor() {
  return useMutation({
    mutationFn: (input: VisitorInput) => api.post<VisitorRow>('/reception/visitors', input),
    meta: { silent: true },
    onSuccess: (v) => {
      invalidate(ok.reception);
      toast.success(`${v.name} signed in${v.badgeNumber ? ` · badge ${v.badgeNumber}` : ''}`);
    },
  });
}

export function useSignOutVisitor() {
  return useMutation({
    mutationFn: (id: string) => api.post<VisitorRow>(`/reception/visitors/${id}/out`),
    onSuccess: (v) => {
      invalidate(ok.reception);
      toast.success(`${v.name} signed out`);
    },
  });
}

export function useEnquiries(params: EnquiryListParams, enabled = true) {
  const can = useCan('reception.read');
  return useQuery({
    queryKey: ok.enquiries(params),
    queryFn: ({ signal }) => api.get<EnquiryRow[]>('/reception/enquiries', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useSaveEnquiry(id?: string) {
  return useMutation({
    mutationFn: (input: EnquiryInput) => (id ? api.put<EnquiryRow>(`/reception/enquiries/${id}`, input) : api.post<EnquiryRow>('/reception/enquiries', input)),
    meta: { silent: true },
    onSuccess: (e) => {
      invalidate(ok.reception);
      toast.success(id ? `Enquiry from ${e.parentName} updated` : `Enquiry from ${e.parentName} logged`);
    },
  });
}

/** Moves an enquiry along the pipeline (a full PUT with the new status). */
export function useMoveEnquiry() {
  return useMutation({
    mutationFn: ({ row, status }: { row: EnquiryRow; status: EnquiryStatus }) => {
      const { id, createdAt: _c, createdBy: _b, followUpDue: _f, ...rest } = row;
      return api.put<EnquiryRow>(`/reception/enquiries/${id}`, { ...rest, status });
    },
    onSuccess: () => invalidate(ok.reception),
  });
}

export function useEnquiryReply() {
  return useMutation({
    mutationFn: (id: string) => api.post<AiEnquiryReply & AiText>(`/reception/enquiries/${id}/reply`),
    // The reply dialog shows failures inline.
    meta: { silent: true },
  });
}

export function usePickups(studentId?: string, enabled = true) {
  const can = useCan('reception.read');
  return useQuery({
    queryKey: ok.pickups(studentId),
    queryFn: ({ signal }) => api.get<PickupRow[]>('/reception/pickups', { studentId }, signal),
    enabled: enabled && can,
  });
}

export function useRecordPickup() {
  return useMutation({
    mutationFn: (input: PickupInput) => api.post<PickupRow>('/reception/pickups', input),
    meta: { silent: true },
    onSuccess: (p) => {
      invalidate(ok.reception);
      if (p.onRecord) toast.success(`${p.student.name} collected by ${p.collectedBy}`);
      else toast.warning(`${p.collectedBy} is not on record for ${p.student.name} — verify their ID`);
    },
  });
}

// ------------------------------------------------------------------ certificates & ID cards

export function useCertificates(params: { kind?: CertificateKind; q?: string }) {
  const can = useCan('documents.issue');
  return useQuery({
    queryKey: ok.certificates(params),
    queryFn: ({ signal }) => api.get<CertificateRow[]>('/documents/certificates', { ...params }, signal),
    enabled: can,
    placeholderData: keepPreviousData,
  });
}

export function useCertificate(id: string | undefined) {
  return useQuery({
    queryKey: ok.certificate(id ?? ''),
    queryFn: ({ signal }) => api.get<CertificateView>(`/documents/certificates/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useIssueCertificate() {
  return useMutation({
    mutationFn: (input: CertificateInput) => api.post<CertificateView>('/documents/certificates', input),
    meta: { silent: true },
    onSuccess: (c) => {
      queryClient.setQueryData(ok.certificate(c.id), c);
      invalidate(ok.documents);
      toast.success(`${c.serial} issued to ${c.recipient.name}`);
    },
  });
}

export function useRevokeCertificate(id: string) {
  return useMutation({
    mutationFn: (reason: string) => api.post<CertificateView>(`/documents/certificates/${id}/revoke`, { reason }),
    meta: { silent: true },
    onSuccess: (c) => {
      queryClient.setQueryData(ok.certificate(c.id), c);
      invalidate(ok.documents);
      toast.success(`${c.serial} revoked — the QR code now shows it as not valid`);
    },
  });
}

export function useDraftCertificate() {
  return useMutation({
    mutationFn: (input: { kind: CertificateKind; studentId?: string; staffId?: string; notes?: string }) => api.post<AiCertificate & AiText>('/documents/certificates/draft', input),
    ...aiError,
  });
}

export function useIdCards(params: { kind: 'STUDENT' | 'STAFF'; classArmId?: string; ids?: string }, enabled: boolean) {
  const can = useCan('documents.issue');
  return useQuery({
    queryKey: ok.idCards(params),
    queryFn: ({ signal }) => api.get<IdCardBatch>('/documents/id-cards', { ...params }, signal),
    enabled: enabled && can,
    staleTime: 5 * 60_000,
  });
}

// ------------------------------------------------------------------ public

export function usePublicVerification(kind: 'certificate' | 'id', code: string) {
  return useQuery({
    queryKey: ['verify', kind, code],
    queryFn: ({ signal }) => api.get<PublicVerification>(`/verify/${kind}/${encodeURIComponent(code)}`, undefined, signal),
    enabled: !!code,
    retry: false,
  });
}

