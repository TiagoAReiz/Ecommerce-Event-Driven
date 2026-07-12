// Forma de escrita do read-model UserContact (upsert idempotente via inbox).
export interface UpsertUserContactInput {
  userId: string;
  email: string;
  name: string;
}
