import Knex from 'knex';
import { env } from '../config/env';

const knexConfig = {
  client: 'pg',
  connection: {
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT),
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
  },
  migrations: {
    directory: __dirname + '/migrations',
  },
  seeds: {
    directory: __dirname + '/seeds',
  },
};

export const knex = Knex(knexConfig);
export default knexConfig;
