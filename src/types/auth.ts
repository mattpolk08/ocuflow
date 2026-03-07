// Phase A1 – Authentication & Authorization Types

export type StaffRole =
  | 'ADMIN'
  | 'PROVIDER'
  | 'BILLING'
  | 'FRONT_DESK'
  | 'NURSE'
  | 'OPTICAL';

export type TokenType = 'ACCESS' | 'REFRESH';

export interface StaffUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: StaffRole;
  providerId?: string;       // links to provider record (dr-chen, dr-patel, etc.)
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  // Never serialized to client:
  // passwordHash excluded in StaffUserPublic
}

export type StaffUserPublic = Omit<StaffUser, 'passwordHash'>;

export interface JWTPayload {
  sub: string;          // staff user ID
  email: string;
  role: StaffRole;
  displayName: string;
  providerId?: string;
  type: TokenType;
  iat: number;
  exp: number;
  jti: string;          // unique token ID (for revocation)
}

export interface AuthSession {
  userId: string;
  refreshTokenId: string;   // jti of the current refresh token
  issuedAt: string;
  expiresAt: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;        // seconds until access token expires
  user: StaffUserPublic;
}

export interface AuthContext {
  userId: string;
  email: string;
  role: StaffRole;
  displayName: string;
  providerId?: string;
  tokenId: string;
}

// Role permission matrix
export const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  ADMIN: ['*'],   // all access
  PROVIDER: [
    'patients:read', 'patients:write',
    'schedule:read', 'schedule:write',
    'exams:read', 'exams:write',
    'billing:read',
    'reports:read',
    'optical:read',
    'portal:read',
    'messaging:read', 'messaging:write',
    'reminders:read',
    'telehealth:read', 'telehealth:write',
    'erx:read', 'erx:write',
    'ai:read', 'ai:write',
    'priorauth:read', 'priorauth:write',
    'rcm:read',
    'scorecards:read',
  ],
  BILLING: [
    'patients:read',
    'schedule:read',
    'exams:read',
    'billing:read', 'billing:write',
    'reports:read', 'reports:write',
    'rcm:read', 'rcm:write',
    'priorauth:read', 'priorauth:write',
    'messaging:read', 'messaging:write',
    'reminders:read',
  ],
  FRONT_DESK: [
    'patients:read', 'patients:write',
    'schedule:read', 'schedule:write',
    'billing:read',
    'optical:read',
    'portal:read',
    'messaging:read', 'messaging:write',
    'reminders:read', 'reminders:write',
    'telehealth:read',
  ],
  NURSE: [
    'patients:read', 'patients:write',
    'schedule:read',
    'exams:read', 'exams:write',
    'messaging:read', 'messaging:write',
    'reminders:read', 'reminders:write',
    'telehealth:read', 'telehealth:write',
    'ai:read',
  ],
  OPTICAL: [
    'patients:read',
    'schedule:read',
    'optical:read', 'optical:write',
    'billing:read',
    'messaging:read',
  ],
};

export interface AuthResp<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
