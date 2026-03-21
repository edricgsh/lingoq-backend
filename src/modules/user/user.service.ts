import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['onboarding'],
    });
  }

  async findByCognitoId(cognitoId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { cognitoId },
      relations: ['onboarding'],
    });
  }
}
