export type Role = 'gentleman' | 'captain' | 'headmaster' | 'officer' | 'alumni';
export type CohortStatus = 'upcoming' | 'active' | 'completed' | 'archived';
export type SquadMemberRole = 'leader' | 'deputy' | 'member';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface ProfileRow {
  id: string;
  role: Role;
  name: string | null;
  photo_url: string | null;
  location: string | null;
  age: number | null;
  phone: string | null;
  bio: string | null;
  purpose_statement: string | null;
  confirmation_standing: string | null;
  onboarding_complete: boolean;
  two_fa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  role?: Role;
  name?: string | null;
  photo_url?: string | null;
  location?: string | null;
  age?: number | null;
  phone?: string | null;
  bio?: string | null;
  purpose_statement?: string | null;
  confirmation_standing?: string | null;
  onboarding_complete?: boolean;
  two_fa_enabled?: boolean;
}

export type ProfileUpdate = Partial<ProfileInsert>;

export interface CohortRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: CohortStatus;
  created_at: string;
}

export interface CohortInsert {
  id?: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: CohortStatus;
}

export type CohortUpdate = Partial<CohortInsert>;

export interface SquadRow {
  id: string;
  cohort_id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
}

export interface SquadInsert {
  id?: string;
  cohort_id: string;
  name: string;
  archived_at?: string | null;
}

export type SquadUpdate = Partial<SquadInsert>;

export interface SquadMemberRow {
  squad_id: string;
  user_id: string;
  role: SquadMemberRole;
  assigned_at: string;
}

export interface SquadMemberInsert {
  squad_id: string;
  user_id: string;
  role?: SquadMemberRole;
  assigned_at?: string;
}

export type SquadMemberUpdate = Partial<SquadMemberInsert>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      cohorts: {
        Row: CohortRow;
        Insert: CohortInsert;
        Update: CohortUpdate;
        Relationships: [];
      };
      squads: {
        Row: SquadRow;
        Insert: SquadInsert;
        Update: SquadUpdate;
        Relationships: [];
      };
      squad_members: {
        Row: SquadMemberRow;
        Insert: SquadMemberInsert;
        Update: SquadMemberUpdate;
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: {
      current_user_role: {
        Args: Record<string, never>;
        Returns: Role;
      };
    };
    Enums: {
      user_role: Role;
      cohort_status: CohortStatus;
      squad_member_role: SquadMemberRole;
    };
  };
}
