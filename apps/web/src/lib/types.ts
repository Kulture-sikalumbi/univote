// Shared API response/request shapes, kept in one place so portals agree on them.

export interface LoginResponse {
  token: string;
  voterID: string;
}

export type EligibilityReasonCode =
  | 'NOT_ENROLLED'
  | 'FINANCIAL_HOLD'
  | 'ALREADY_VOTED'
  | 'ELECTION_CLOSED';

export interface EligibilityResponse {
  eligible: boolean;
  reasonCode?: EligibilityReasonCode;
}

export interface Candidate {
  CandidateID: string;
  FullName: string;
  Party?: string | null;
  Position: string;
  ManifestoURL?: string | null;
  ImageURL?: string | null;
}

export interface BallotResponse {
  election: {
    title: string;
    status: string;
    offices: string[];
  };
  candidates: Candidate[];
}

export interface CastVoteResponse {
  ballotID: string;
  confirmation: string;
}

export interface BallotLoginCompleteResponse {
  ballotToken: string;
}

export type ElectionStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface Election {
  ElectionID: string;
  Title: string;
  Status: ElectionStatus;
  StartTime: string;
  EndTime: string;
  offices?: ElectionOffice[];
  affiliations?: ElectionAffiliation[];
  candidates?: Candidate[];
}

export interface ElectionOffice {
  OfficeID: string;
  Name: string;
  SortOrder: number;
}

export interface ElectionAffiliation {
  AffiliationID: string;
  Name: string;
}

export interface TallyEntry {
  candidateID: string;
  fullName: string;
  position: string;
  party?: string | null;
  votes: number;
}

export interface ResultsResponse {
  tally: TallyEntry[];
  totalParticipants: number;
}

export interface Voter {
  VoterID: string;
  StudentID: string;
  IsActive: boolean;
  EnrolledAt: string;
}

export type TenantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface Tenant {
  TenantID: string;
  SchoolName: string;
  TenantCode: string;
  DomainURL?: string | null;
  SchemaName: string;
  CreatedAt: string;
  Status: TenantStatus;
  LogoURL?: string | null;
}

export interface Branding {
  schoolName: string | null;
  logoURL: string | null;
  status: TenantStatus | null;
}
