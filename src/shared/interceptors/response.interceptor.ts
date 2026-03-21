import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface PaginatedResponse {
  data: unknown[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface StandardResponse {
  StatusCode: number;
  Message: string;
  IsSuccess: boolean;
  Data: unknown | null;
  Pagination?: {
    NextCursor: string | null;
    HasMore: boolean;
  };
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse> | Observable<void> {
    const response = context.switchToHttp().getResponse();

    if (response.statusCode >= 300 && response.statusCode < 400) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        if (data === undefined || data === null) {
          return {
            StatusCode: 200,
            Message: 'Success',
            IsSuccess: true,
            Data: null,
          };
        }

        const isPaginatedResponse =
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'nextCursor' in data &&
          'hasMore' in data;

        if (isPaginatedResponse) {
          const paginatedData = data as PaginatedResponse;
          return {
            StatusCode: 200,
            Message: 'Success',
            IsSuccess: true,
            Data: paginatedData.data,
            Pagination: {
              NextCursor: paginatedData.nextCursor,
              HasMore: paginatedData.hasMore,
            },
          };
        }

        return {
          StatusCode: 200,
          Message: 'Success',
          IsSuccess: true,
          Data: data,
        };
      }),
    );
  }
}
