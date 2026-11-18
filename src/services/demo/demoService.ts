import type { ApiOk } from '../../../shared/types';
import { request } from '../http';
import { rodizioStore } from '../connection/store';

export interface NetworkInfo {
  port: number;
  addresses: { name: string; address: string; url: string }[];
}

export const demoService = {
  async activate(): Promise<ApiOk> {
    const res = await request<ApiOk>('POST', '/api/demo/activate', {});
    rodizioStore.applySnapshot(res.snapshot);
    return res;
  },
  async reset(): Promise<ApiOk> {
    const res = await request<ApiOk>('POST', '/api/demo/reset', {});
    rodizioStore.applySnapshot(res.snapshot);
    return res;
  },
  async exit(): Promise<ApiOk> {
    const res = await request<ApiOk>('POST', '/api/demo/exit', {});
    rodizioStore.applySnapshot(res.snapshot);
    return res;
  },
  async network(): Promise<NetworkInfo> {
    return request<NetworkInfo>('GET', '/api/network');
  },
};

