/**
 * Migration: Add Webhook Tables
 * Version: 002_add_webhooks.js
 * Description: Adds tables for webhook registration and delivery logging
 */

exports.up = async function(knex) {
  // Create webhooks table
  await knex.schema.createTable('webhooks', function(table) {
    table.string('id').primary().comment('Unique webhook identifier');
    table.string('tenant_id').notNullable().comment('Owning tenant');
    table.string('url').notNullable().comment('Delivery endpoint URL');
    table.json('events').notNullable().comment('Array of subscribed event types');
    table.string('secret').notNullable().comment('HMAC-SHA256 signing secret');
    table.text('description').nullable().comment('Human-readable description');
    table.boolean('is_active').defaultTo(true).comment('Whether the webhook is active');
    table.string('payload_version').defaultTo('1.0').comment('Payload schema version');
    table.integer('consecutive_failures').defaultTo(0).comment('Current consecutive failure count');
    table.timestamp('last_failure_at').nullable().comment('Timestamp of last failure');
    table.timestamp('created_at').defaultTo(knex.fn.now()).comment('Creation timestamp');
    table.timestamp('updated_at').defaultTo(knex.fn.now()).comment('Last update timestamp');

    // Indexes
    table.index(['tenant_id'], 'idx_webhooks_tenant_id');
    table.index(['tenant_id', 'is_active'], 'idx_webhooks_tenant_active');
    table.index(['created_at'], 'idx_webhooks_created_at');
  });

  // Create webhook_deliveries table
  await knex.schema.createTable('webhook_deliveries', function(table) {
    table.string('id').primary().comment('Unique delivery identifier');
    table.string('webhook_id').notNullable().comment('Reference to webhooks.id');
    table.string('event_type').notNullable().comment('Event type delivered');
    table.integer('delivery_attempt').defaultTo(1).comment('Attempt number (1-based)');
    table.integer('status_code').nullable().comment('HTTP response status code');
    table.text('response_body').nullable().comment('Truncated response body (max 2048 chars)');
    table.integer('duration_ms').nullable().comment('Request duration in milliseconds');
    table.string('status').notNullable().defaultTo('pending').comment('pending|success|failed|retrying');
    table.timestamp('next_retry_at').nullable().comment('Scheduled retry time');
    table.text('error_message').nullable().comment('Error description on failure');
    table.timestamp('created_at').defaultTo(knex.fn.now()).comment('Creation timestamp');

    // Indexes
    table.index(['webhook_id'], 'idx_webhook_deliveries_webhook_id');
    table.index(['webhook_id', 'status'], 'idx_webhook_deliveries_status');
    table.index(['webhook_id', 'created_at'], 'idx_webhook_deliveries_created');
    table.index(['next_retry_at'], 'idx_webhook_deliveries_retry');

    // Foreign key
    table.foreign('webhook_id', 'fk_webhook_deliveries_webhook_id')
      .references('webhooks.id')
      .onDelete('CASCADE');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('webhook_deliveries');
  await knex.schema.dropTableIfExists('webhooks');
};
