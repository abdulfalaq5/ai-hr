import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hr_document_contents', (table) => {
    table.uuid('id').primary();
    table.uuid('document_id').notNullable().references('id').inTable('hr_documents').onDelete('CASCADE');
    table.integer('page_no').notNullable().defaultTo(0);
    table.string('bab', 100).notNullable().defaultTo('');
    table.string('pasal', 100).notNullable().defaultTo('');
    table.string('ayat', 100).notNullable().defaultTo('');
    table.text('title').notNullable().defaultTo('');
    table.text('content').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // GIN Full Text Search index on content column
  // Try 'indonesian' config first, fall back to 'simple' if not installed
  await knex.raw(`
    DO $$
    BEGIN
      -- Check if 'indonesian' text search configuration exists
      IF EXISTS (
        SELECT 1 FROM pg_ts_config WHERE cfgname = 'indonesian'
      ) THEN
        CREATE INDEX idx_hr_document_contents_content_fts
          ON hr_document_contents
          USING GIN (to_tsvector('indonesian', content));
      ELSE
        -- Fallback: use 'simple' config
        CREATE INDEX idx_hr_document_contents_content_fts
          ON hr_document_contents
          USING GIN (to_tsvector('simple', content));
      END IF;
    END
    $$;
  `);

  // Additional index on document_id for fast joins
  await knex.schema.table('hr_document_contents', (table) => {
    table.index('document_id', 'idx_hr_document_contents_doc_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_hr_document_contents_content_fts');
  await knex.raw('DROP INDEX IF EXISTS idx_hr_document_contents_doc_id');
  await knex.schema.dropTableIfExists('hr_document_contents');
}
