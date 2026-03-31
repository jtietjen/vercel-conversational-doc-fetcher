import { beforeAll } from 'vitest';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

beforeAll(() => {
  const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (proxy) {
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
});
