export function techstackManagerAvailable(environment = process.env.NODE_ENV) {
  return environment !== 'production';
}
