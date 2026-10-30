import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();

const result = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`);

console.log(result.rows.map(row => row.table_name).join('\n'));

await client.end();