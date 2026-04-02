import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsObject, IsEmail, MinLength } from 'class-validator';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { GetUser } from 'src/decorators/user.decorator';
import { UserRole } from 'src/enums/user-role.enum';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { UserDTO } from 'src/dtos/user.dto';
import { AdminService } from './admin.service';

class TriggerJobDto {
  @IsString()
  queue: PgBossQueueEnum;

  @IsOptional()
  @IsObject()
  payload: Record<string, any>;
}

class AdminCreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class SendTestEmailDto {
  @IsString()
  recipientEmail: string;

  @IsString()
  templateName: string;

  @IsOptional()
  @IsObject()
  templateData: Record<string, any>;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('create-user')
  async createUser(@Body() dto: AdminCreateUserDto, @GetUser() _user: UserDTO) {
    return this.adminService.adminCreateUser(dto.name, dto.email, dto.password);
  }

  @Get('job-definitions')
  async getJobDefinitions() {
    return this.adminService.getJobDefinitions();
  }

  @Post('trigger-job')
  async triggerJob(@Body() dto: TriggerJobDto, @GetUser() _user: UserDTO) {
    return this.adminService.triggerJob(dto.queue, dto.payload ?? {});
  }

  @Get('email-config')
  async getEmailConfig() {
    return this.adminService.getEmailConfig();
  }

  @Post('send-test-email')
  async sendTestEmail(@Body() dto: SendTestEmailDto, @GetUser() _user: UserDTO) {
    return this.adminService.sendTestEmail(dto.recipientEmail, dto.templateName, dto.templateData ?? {});
  }
}
