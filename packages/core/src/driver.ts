// Driver management implementation
import { Driver as IDriver } from './types';

export class DriverManager {
  private drivers: Map<string, IDriver> = new Map();

  registerDriver(driver: IDriver): void {
    this.drivers.set(driver.id, driver);
  }

  getDriver(id: string): IDriver | undefined {
    return this.drivers.get(id);
  }

  unregisterDriver(id: string): boolean {
    return this.drivers.delete(id);
  }

  getAllDrivers(): IDriver[] {
    return Array.from(this.drivers.values());
  }
}