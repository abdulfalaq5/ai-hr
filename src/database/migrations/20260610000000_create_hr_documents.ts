import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hr_documents', (table) => {
    table.uuid('id').primary();
    table.string('document_name', 255).notNullable();
    table.string('document_type', 100).notNullable();
    table.string('version', 50).notNullable().defaultTo('1.0');
    table.date('effective_date').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hr_documents');
}
