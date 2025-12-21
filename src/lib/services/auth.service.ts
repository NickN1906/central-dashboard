import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import prisma from '@/lib/db'
import { AdminUser } from '@/lib/types'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-do-not-use-in-production'
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn']

export interface JwtPayload {
  userId: number
  email: string
}

/**
 * Create a new admin user
 */
export async function createAdminUser(
  email: string,
  password: string,
  name?: string
): Promise<AdminUser> {
  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.adminUser.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name
    }
  })

  return {
    id: user.id,
    email: user.email,
    name: user.name
  }
}

/**
 * Authenticate admin user
 */
export async function authenticateAdmin(
  email: string,
  password: string
): Promise<{ user: AdminUser; token: string } | null> {
  const user = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() }
  })

  if (!user) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return null
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email } as JwtPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    },
    token
  }
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    return payload
  } catch {
    return null
  }
}

/**
 * Get admin user by ID
 */
export async function getAdminById(id: number): Promise<AdminUser | null> {
  const user = await prisma.adminUser.findUnique({
    where: { id }
  })

  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name
  }
}

/**
 * Update admin password
 */
export async function updateAdminPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId }
  })

  if (!user) {
    return false
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!isValid) {
    return false
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10)
  await prisma.adminUser.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash }
  })

  return true
}

/**
 * Check if any admin exists (for initial setup)
 */
export async function hasAnyAdmin(): Promise<boolean> {
  const count = await prisma.adminUser.count()
  return count > 0
}
