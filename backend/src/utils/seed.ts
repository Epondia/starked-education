import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'starked_dev'
});

async function runSeed() {
  const client = await pool.connect();
  try {
    console.log('Seeding development data...');
    // Create users table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert dummy user
    await client.query(`
      INSERT INTO users (email, name)
      VALUES ('admin@starked.edu', 'Admin User')
      ON CONFLICT (email) DO NOTHING
    `);

    console.log('Development data seeded successfully.');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
