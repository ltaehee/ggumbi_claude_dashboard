import bcrypt from "bcryptjs";
const hash = bcrypt.hashSync("0000", 10);
console.log(hash);
