import bcrypt from 'bcrypt';
import { query } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { AppRole } from '../../shared/middleware/auth';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt';

interface UserRow {
  id: string;
  role: AppRole;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  is_active: boolean;
}

interface UserProfile {
  id: string;
  role: AppRole;
  email: string | null;
  username: string | null;
  fullName: string | null;
  tenantId: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

const toUserProfile = async (user: UserRow): Promise<UserProfile> => {
  const managerProfilePromise =
    user.role === 'MANAGER'
      ? query<{ full_name: string }>('SELECT full_name FROM manager_profile WHERE user_id = $1 LIMIT 1', [user.id])
      : Promise.resolve({ rows: [] as { full_name: string }[] });

  const tenantPromise =
    user.role === 'TENANT'
      ? query<{ id: string; full_name: string }>('SELECT id, full_name FROM tenant WHERE user_id = $1 LIMIT 1', [user.id])
      : Promise.resolve({ rows: [] as { id: string; full_name: string }[] });

  const [managerProfile, tenant] = await Promise.all([managerProfilePromise, tenantPromise]);

  return {
    id: user.id,
    role: user.role,
    email: user.email,
    username: user.username,
    fullName: managerProfile.rows[0]?.full_name ?? tenant.rows[0]?.full_name ?? null,
    tenantId: tenant.rows[0]?.id ?? null
  };
};

const isBcryptHash = (hash: string): boolean => hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');

const hasPassword = (user: UserRow): user is UserRow & { password_hash: string } => Boolean(user.password_hash?.trim());

const verifyPassword = async (user: UserRow, plainPassword: string): Promise<boolean> => {
  if (!hasPassword(user)) {
    return true;
  }

  if (isBcryptHash(user.password_hash)) {
    return bcrypt.compare(plainPassword, user.password_hash);
  }

  const { rows } = await query<{ is_valid: boolean }>('SELECT crypt($1, $2) = $2 AS is_valid', [plainPassword, user.password_hash]);
  const isLegacyValid = Boolean(rows[0]?.is_valid);

  if (!isLegacyValid) {
    return false;
  }

  const rehashed = await bcrypt.hash(plainPassword, 10);
  await query('UPDATE app_user SET password_hash = $1 WHERE id = $2', [rehashed, user.id]);
  return true;
};

export const authenticateLogin = async (identifier: string, password = ''): Promise<LoginResult> => {
  const { rows } = await query<UserRow>(
    `SELECT id, role, email, username, password_hash, is_active
     FROM app_user
     WHERE email = $1 OR username = $1
     LIMIT 1`,
    [identifier]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    throw new AppError(401, 'Invalid credentials');
  }

  const passwordMatches = await verifyPassword(user, password);
  if (!passwordMatches) {
    throw new AppError(401, 'Invalid credentials');
  }

  const userProfile = await toUserProfile(user);

  await query('UPDATE app_user SET last_login_at = now() WHERE id = $1', [user.id]);

  return {
    accessToken: signAccessToken({ userId: user.id, role: user.role }),
    refreshToken: signRefreshToken({ userId: user.id, role: user.role }),
    user: userProfile
  };
};

export const refreshAccessToken = async (refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> => {
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.tokenType !== 'refresh') {
      throw new AppError(401, 'Invalid refresh token');
    }

    const { rows } = await query<{ id: string; role: AppRole; is_active: boolean }>(
      'SELECT id, role, is_active FROM app_user WHERE id = $1 LIMIT 1',
      [payload.userId]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      throw new AppError(401, 'Invalid refresh token');
    }

    return {
      accessToken: signAccessToken({ userId: user.id, role: user.role })
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, 'Invalid refresh token');
  }
};

export const getCurrentUser = async (userId: string): Promise<UserProfile> => {
  const { rows } = await query<UserRow>(
    'SELECT id, role, email, username, password_hash, is_active FROM app_user WHERE id = $1 LIMIT 1',
    [userId]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    throw new AppError(404, 'User not found');
  }

  return toUserProfile(user);
};
