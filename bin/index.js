#!/usr/bin/env node

const chalk = require('chalk');

// Using Chalk v4 syntax
console.log(chalk.blue.bold("\n-----------------------------------------"));
console.log(chalk.bgBlue.white.bold(" RIB COLOR AUDITOR "));
console.log(chalk.blue.bold("-----------------------------------------"));
console.log(chalk.green("✔") + " Environment Ready");
console.log(chalk.yellow("➜") + " Target: " + chalk.cyan(process.cwd()));
console.log(chalk.blue.bold("-----------------------------------------\n"));