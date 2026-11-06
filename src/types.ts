export type Role = 'instructor' | 'student';

export type CycleIndex = 1 | 2 | 3 | 4;

export type SessionStatus = 'pending' | 'attended' | 'absent' | 'cancelled';

export type MakeupStatus = 'planned' | 'done' | 'absent';

export type MakeupInfo = {
  date: string;
  time: string;
  status: MakeupStatus;
};

export type SessionFile = {
  id: string;
  name: string;
  uri: string;
  mime?: string;
};

export type LessonSession = {
  id: string;
  cycle: CycleIndex;
  pack: number;
  status: SessionStatus;
  date: string;
  time: string;
  originalDate?: string;
  makeup: MakeupInfo | null;
  note: string;
  studentNote: string;
  /** Checked markdown checklist item ids (`item-0`, …) for this student's session */
  checklistChecked?: string[];
  attachments: SessionFile[];
  removedAttachmentIds?: string[];
  updatedAt?: string;
};

export type PackPayment = {
  pack: number;
  paid: boolean;
  paidAt?: string;
  paidSessionId?: string;
};

export type MonthlyGoalItem = {
  id: string;
  text: string;
  checked: boolean;
  /** YYYY-MM when the goal was first added */
  createdMonth: string;
  updatedAt?: string;
};

/** Keys are YYYY-MM (local calendar month). */
export type MonthlyGoalsStore = Record<string, MonthlyGoalItem[]>;

export type Student = {
  id: string;
  name: string;
  joinCode: string;
  linkedUid: string | null;
  paid: boolean;
  payments: PackPayment[];
  weekday: number;
  time: string;
  weeklyTime: string;
  startCycle: CycleIndex;
  sessions: LessonSession[];
  removedSessionIds?: string[];
  monthlyGoals?: MonthlyGoalsStore;
};

export type RemovedStudent = {
  id: string;
  name?: string;
  joinCode?: string;
  linkedUid?: string | null;
  removedAt: string;
};

export type BankAccount = {
  id?: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export type Closure = {
  id: string;
  date: string;
  endDate?: string;
  time: string;
  reason: string;
  scope: 'all' | 'student';
  studentId?: string;
};

export type OpenSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
};

export type MakeupRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';
export type MakeupIntent = 'apply' | 'withdraw' | 'change';

export type MakeupRequest = {
  id: string;
  studentId: string;
  studentName: string;
  sessionId: string;
  sessionDate: string;
  sessionCycle: number;
  slotId: string;
  date: string;
  time: string;
  endTime?: string;
  status: MakeupRequestStatus;
  intent?: MakeupIntent;
  createdAt: string;
  updatedAt?: string;
  decidedBy?: 'instructor';
  acknowledgedAt?: string;
  previousSlotId?: string;
  previousDate?: string;
  previousTime?: string;
  previousEndTime?: string;
  previousSessionId?: string;
  previousSessionDate?: string;
  previousSessionCycle?: number;
};

export type Account = {
  uid: string;
  name: string;
  password: string;
  role: Role;
  studentId?: string;
  passwordHash?: string;
};

export type AppUser = {
  uid: string;
  name: string;
  role: Role;
  studentId?: string;
};

export type AnonymousFeedback = {
  id: string;
  body: string;
  createdAt: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  studentIds: string[];
  createdAt: string;
  expiresOn?: string;
  deletedAt?: string;
  /** When set, this row mirrors a studio-wide closure; removed when the closure is deleted. */
  linkedClosureId?: string;
};
