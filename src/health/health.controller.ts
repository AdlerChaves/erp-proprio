import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Publico } from '../modules/auth/auth.decorators';

@Publico()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
