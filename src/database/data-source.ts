import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../config/database.config';

export default new DataSource(databaseOptions());
