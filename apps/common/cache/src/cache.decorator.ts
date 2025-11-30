import { Inject } from '@nestjs/common';
import { CACHE_SERVICE } from './cache.constants';

export const InjectCache = () => Inject(CACHE_SERVICE);