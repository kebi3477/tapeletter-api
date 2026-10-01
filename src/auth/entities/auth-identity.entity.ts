import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export const AUTH_PROVIDERS = ['kakao', 'apple', 'google', 'dev'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** 소셜 로그인 계정. 한 사용자에 여러 개를 연결할 수 있다 */
@Entity('auth_identities')
@Unique('UQ_auth_identities_provider_sub', ['provider', 'providerSub'])
export class AuthIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_auth_identities_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  provider: AuthProvider;

  /** 카카오 회원번호, Apple sub, Google sub */
  @Column({ name: 'provider_sub', type: 'varchar', length: 255 })
  providerSub: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  /** Apple refresh token (암호화). 탈퇴할 때 토큰 철회에 쓴다 */
  @Column({ name: 'provider_refresh_token', type: 'text', nullable: true })
  providerRefreshToken: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;
}
