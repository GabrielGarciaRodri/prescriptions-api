import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Role, User } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * Hashea el refresh token con SHA-256. No usamos bcrypt aquí porque
   * el refresh token ya es un string aleatorio de alta entropía (32 bytes),
   * no necesita salting; solo necesitamos un hash determinístico rápido
   * para poder buscarlo por índice en DB.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('hex'); // 96 chars
  }

  private async signAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    const ttl = parseInt(this.config.get<string>('JWT_ACCESS_TTL') ?? '900', 10);
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: ttl,
      },
    );
  }

  private async issueTokenPair(
    user: Pick<User, 'id' | 'email' | 'role'>,
    meta: { userAgent?: string; ip?: string } = {},
    replacedFromId?: string,
  ): Promise<TokenPair> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = this.generateRefreshToken();
    const refreshTtl = parseInt(
      this.config.get<string>('JWT_REFRESH_TTL') ?? '604800',
      10,
    );
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    const created = await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    // Si esto reemplaza a otro token, encadenamos
    if (replacedFromId) {
      await this.prisma.refreshToken.update({
        where: { id: replacedFromId },
        data: { replacedById: created.id },
      });
    }

    return { accessToken, refreshToken };
  }

  async login(
    email: string,
    password: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.issueTokenPair(user, meta);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Rotación de refresh token con detección de reuso.
   * - Si el token llega y existe + no revocado + no expirado → rota normalmente.
   * - Si el token llega pero está revocado → ATAQUE (alguien lo robó y lo está
   *   reusando). Revocamos toda la familia del usuario por seguridad.
   * - Si el token no existe en absoluto → error genérico.
   */
  async refresh(
    refreshToken: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Detección de reuso: si llega un token ya revocado, revocar toda la familia
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException(
        'Refresh token reutilizado. Sesiones revocadas por seguridad.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Revocar el actual y emitir nuevo par (rotación)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(stored.user, meta, stored.id);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        doctorProfile: true,
        patientProfile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      doctorId: user.doctorProfile?.id,
      patientId: user.patientProfile?.id,
      specialty: user.doctorProfile?.specialty,
      createdAt: user.createdAt,
    };
  }
}