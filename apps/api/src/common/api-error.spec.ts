import { HttpException } from '@nestjs/common';
import { AllExceptionsFilter, AppError } from './api-error';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status };
  const host: any = {
    switchToHttp: () => ({ getResponse: () => res }),
  };
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('passes an AppError through untouched', () => {
    const { host, status, json } = makeHost();
    const err = new AppError('NAME_CONFLICT', 'name taken', 409, { foo: 'bar' });

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ code: 'NAME_CONFLICT', message: 'name taken', details: { foo: 'bar' } });
  });

  it('maps a 401 HttpException to UNAUTHORIZED', () => {
    const { host, status, json } = makeHost();
    const err = new HttpException('nope', 401);

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ code: 'UNAUTHORIZED', message: 'nope' });
  });

  it('maps a 403 HttpException to FORBIDDEN', () => {
    const { host, status, json } = makeHost();
    const err = new HttpException('nope', 403);

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ code: 'FORBIDDEN', message: 'nope' });
  });

  it('maps a 404 HttpException to NODE_NOT_FOUND', () => {
    const { host, status, json } = makeHost();
    const err = new HttpException('missing', 404);

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ code: 'NODE_NOT_FOUND', message: 'missing' });
  });

  it('maps a 400 HttpException to VALIDATION_FAILED', () => {
    const { host, status, json } = makeHost();
    const err = new HttpException('bad', 400);

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ code: 'VALIDATION_FAILED', message: 'bad' });
  });

  it('maps an unrecognized HttpException status to INTERNAL', () => {
    const { host, status, json } = makeHost();
    const err = new HttpException('teapot', 418);

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({ code: 'INTERNAL', message: 'teapot' });
  });

  it('turns a plain Error into a 500 INTERNAL response with no internal detail leaked', () => {
    const { host, status, json } = makeHost();
    const err = new Error('database connection string: postgres://user:pass@host/db exploded');

    filter.catch(err, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ code: 'INTERNAL', message: expect.any(String) });
    const body = json.mock.calls[0][0];
    expect(body.message).not.toContain('postgres://');
    expect(body).not.toHaveProperty('stack');
  });
});
