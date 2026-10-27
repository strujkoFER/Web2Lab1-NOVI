import { Pool } from 'pg'
import dotenv from 'dotenv'
dotenv.config()

export type Pass = { id: string; name: string; document: string; issuedAt: string; status: 'ACTIVE' | 'CANCELLED' };

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  ssl: true,
});

function toPass(r: any): Pass {
  return {
    id: r.id,
    name: r.name,
    document: r.document,
    issuedAt: new Date(r.issued_at).toISOString(),
    status: r.status,
  };
}

export async function getPasses(): Promise<Pass[]> {
  const results = await pool.query(`SELECT id, name, document, issued_at, status FROM passes ORDER BY issued_at DESC`);
  return results.rows.map(toPass);
}

export async function getPass(id: string): Promise<Pass | undefined> {
  const results = await pool.query(`SELECT id, name, document, issued_at, status FROM passes WHERE id::text = $1`, [id]);
  return results.rows[0] ? toPass(results.rows[0]) : undefined;
}

export async function savePass(pass: Pass) {
  await pool.query(
    'INSERT INTO passes (id, name, document, issued_at, status) VALUES ($1, $2, $3, $4, $5)',
    [pass.id, pass.name, pass.document, pass.issuedAt, pass.status],
  );
}

export async function cancelPass(id: string): Promise<boolean> {
  const results = await pool.query(`UPDATE passes SET status = 'CANCELLED' WHERE id::text = $1`, [id]);
  return (results.rowCount ?? 0) > 0;
}

export async function deletePass(id: string): Promise<boolean> {
  const results = await pool.query('DELETE FROM passes WHERE id::text = $1', [id]);
  return (results.rowCount ?? 0) > 0;
}

export async function countPasses(): Promise<{ total: number; active: number }> {
  const results = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active FROM passes`,
  );
  return { total: results.rows[0].total, active: results.rows[0].active };
}
