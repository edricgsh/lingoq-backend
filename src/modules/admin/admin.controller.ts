import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsObject,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { GetUser } from 'src/decorators/user.decorator';
import { UserRole } from 'src/enums/user-role.enum';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { SupadataKeyStatus } from 'src/entities/supadata-api-key.entity';
import { UserDTO } from 'src/dtos/user.dto';
import { AdminService } from './admin.service';
import { SupadataApiKeyService } from 'src/modules/supadata-api-key/supadata-api-key.service';

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

class CreateSupadataKeyDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? true)
  isActive?: boolean;
}

class UpdateSupadataKeyDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  apiKey?: string;

  @IsOptional()
  @IsEnum(SupadataKeyStatus)
  status?: SupadataKeyStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  nextActiveTime?: string;
}

class ImportSupadataKeyRow {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ImportSupadataKeysDto {
  @IsOptional()
  keys: ImportSupadataKeyRow[];
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly supadataApiKeyService: SupadataApiKeyService,
  ) {}

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

  // ---- Supadata API Keys ----

  @Get('supadata-keys')
  async listSupadataKeys() {
    return this.supadataApiKeyService.list();
  }

  @Post('supadata-keys')
  async createSupadataKey(@Body() dto: CreateSupadataKeyDto) {
    return this.supadataApiKeyService.create(dto.email, dto.apiKey, dto.isActive ?? true);
  }

  @Patch('supadata-keys/:id')
  async updateSupadataKey(@Param('id') id: string, @Body() dto: UpdateSupadataKeyDto) {
    return this.supadataApiKeyService.update(id, {
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.apiKey !== undefined && { apiKey: dto.apiKey }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.nextActiveTime !== undefined && {
        nextActiveTime: dto.nextActiveTime ? new Date(dto.nextActiveTime) : null,
      }),
    });
  }

  @Delete('supadata-keys/:id')
  async deleteSupadataKey(@Param('id') id: string) {
    await this.supadataApiKeyService.remove(id);
    return { deleted: true };
  }

  @Get('supadata-keys/credits')
  async getSupadataCredits(@Query('ids') ids: string) {
    const idList = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return this.supadataApiKeyService.getCreditsForKeys(idList);
  }

  @Post('supadata-keys/:id/refresh-credits')
  async forceRefreshCredits(@Param('id') id: string) {
    return this.supadataApiKeyService.forceRefreshCredits(id);
  }

  @Get('supadata-keys/export')
  async exportSupadataKeys() {
    return this.supadataApiKeyService.exportKeys();
  }

  @Post('supadata-keys/import')
  async importSupadataKeys(@Body() dto: ImportSupadataKeysDto) {
    return this.supadataApiKeyService.importKeys(dto.keys ?? []);
  }
}
