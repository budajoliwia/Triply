import { initializeApp } from 'firebase-admin/app';

initializeApp();

export * from './triggers/postInteractions';
export * from './triggers/onFollowUser';
