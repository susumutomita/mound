// Application ports. Usecases depend only on these interfaces.
// Concrete implementations live in adapters/.
import type {
  AuditLog,
  Game,
  GameStatus,
  GroundSlot,
  Member,
  MemberRsvp,
  Rsvp,
  RsvpBreakdown,
  RsvpSummary,
  Team,
} from "./domain/types";

export interface TeamRepository {
  insert(team: Team): Promise<Team>;
  list(): Promise<Team[]>;
  get(id: string): Promise<Team | null>;
}

export interface MemberRepository {
  insert(member: Member): Promise<Member>;
  list(teamId: string): Promise<Member[]>;
  get(id: string): Promise<Member | null>;
}

export interface GameRepository {
  insert(game: Game): Promise<Game>;
  list(filter: { teamId?: string; status?: GameStatus }): Promise<Game[]>;
  get(id: string): Promise<Game | null>;
  updateStatus(
    id: string,
    status: GameStatus,
    updatedAt: string,
  ): Promise<void>;
}

export interface RsvpRepository {
  upsert(rsvp: Rsvp): Promise<Rsvp>;
  list(gameId: string): Promise<Rsvp[]>;
  listWithMembers(gameId: string, teamId: string): Promise<MemberRsvp[]>;
  breakdown(gameId: string, teamId: string): Promise<RsvpBreakdown>;
  summarize(gameId: string, teamId: string): Promise<RsvpSummary>;
}

export interface AuditRepository {
  insert(log: AuditLog): Promise<AuditLog>;
  list(targetType: string, targetId: string): Promise<AuditLog[]>;
}

export interface GroundSlotFilter {
  source?: string;
  dateIso?: string;
}

export interface GroundSlotRepository {
  upsert(slot: GroundSlot): Promise<GroundSlot>;
  list(filter: GroundSlotFilter): Promise<GroundSlot[]>;
  getByKey(slotKey: string): Promise<GroundSlot | null>;
}

export interface Repositories {
  teams: TeamRepository;
  members: MemberRepository;
  games: GameRepository;
  rsvps: RsvpRepository;
  audit: AuditRepository;
  groundSlots: GroundSlotRepository;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export interface UseCaseContext extends Clock, IdGenerator {
  repo: Repositories;
}
