import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const waitlistInterests = sqliteTable(
  'waitlist_interests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('waitlist_interests_email_unique').on(table.email)],
);
