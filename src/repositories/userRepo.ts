import { User } from '../types';
import { createAsyncStore } from './asyncStore';

export const userRepo = createAsyncStore<User>((u) => u.username);
