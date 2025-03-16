/*
  Warnings:

  - You are about to alter the column `baseSalary` on the `employees` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- AlterTable
ALTER TABLE `employees` MODIFY `baseSalary` INTEGER NULL;
