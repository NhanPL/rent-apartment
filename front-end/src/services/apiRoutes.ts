export const API_ROUTES = {
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  buildings: {
    list: '/buildings',
    detail: (id: string) => `/buildings/${id}`,
  },
  rooms: {
    list: '/rooms',
    detail: (id: string) => `/rooms/${id}`,
    occupancy: (id: string) => `/rooms/${id}/occupancy`,
  },
  tenants: {
    list: '/tenants',
    detail: (id: string) => `/tenants/${id}`,
  },
  contracts: {
    list: '/contracts',
    detail: (id: string) => `/contracts/${id}`,
  },
  invoices: {
    list: '/invoices',
    detail: (id: string) => `/invoices/${id}`,
    prefill: '/invoices/prefill',
    fromReading: (utilityReadingId: string) => `/invoices/from-reading/${utilityReadingId}`,
    adjustments: (id: string) => `/invoices/${id}/adjustments`,
  },
  payments: {
    requests: '/payments/requests',
    requestDetail: (id: string) => `/payments/requests/${id}`,
    submitProof: (id: string) => `/payments/requests/${id}/proofs`,
    approveProof: (id: string) => `/payments/proofs/${id}/approve`,
    rejectProof: (id: string) => `/payments/proofs/${id}/reject`,
  },
  utilityReadings: {
    list: '/utility-readings',
    detail: (id: string) => `/utility-readings/${id}`,
    create: '/utility-readings',
    evidence: (id: string) => `/utility-readings/${id}/evidence`,
    approve: (id: string) => `/utility-readings/${id}/approve`,
    reject: (id: string) => `/utility-readings/${id}/reject`,
  },
  utilityRates: {
    list: '/utility-rates',
    detail: (id: string) => `/utility-rates/${id}`,
  },
  me: {
    room: '/me/room',
    roommates: '/me/roommates',
    currentBill: '/me/current-bill',
    utilityReadings: '/me/utility-readings',
    paymentStatus: '/me/payment-status',
  },
  uploads: {
    metadata: '/uploads/metadata',
  },
} as const
