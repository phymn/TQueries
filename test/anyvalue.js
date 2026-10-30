// v0.4 "Any Value": dialect functions computed on the practice copy. Returns [[dialect, sql, expected]].
const T = [{ name: 'EMP', columns: [{ name: 'ID' }, { name: 'F_NAME' }, { name: 'L_NAME' }, { name: 'B_DATE' }, { name: 'ADDRESS' }, { name: 'SALARY' }, { name: 'DEP' }, { name: 'MID' }] }];
const D = { EMP: [['E1', 'John', 'Thomas', '1976-01-09', '5631 Rice, OakPark,IL', 100000, 2, null], ['E2', 'Alice', 'James', '1972-07-31', '980 Berry ln, Elgin,IL', 80000, 5, 'E1'], ['E3', 'Steve', 'Wells', '1980-08-10', '291 Springs, Gary,TX', 50000, 5, 'E1']] };
const W = " FROM EMP WHERE ID = 'E1'", ALL = ' FROM EMP ORDER BY ID';
const C = [
  // text
  ['sqlserver', 'SELECT LEN(F_NAME)' + ALL, [4, 5, 5]], ['mysql', 'SELECT CHAR_LENGTH(F_NAME)' + ALL, [4, 5, 5]], ['oracle', 'SELECT LENGTH(F_NAME)' + ALL, [4, 5, 5]], ['access', 'SELECT Len([F_NAME])' + ALL, [4, 5, 5]],
  ['sqlserver', "SELECT F_NAME + ' ' + L_NAME" + W, 'John Thomas'], ['access', "SELECT [F_NAME] & ' ' & [L_NAME]" + W, 'John Thomas'], ['mysql', "SELECT CONCAT_WS(' ', F_NAME, L_NAME)" + W, 'John Thomas'],
  ['sqlserver', 'SELECT LEFT(F_NAME, 1) + LEFT(L_NAME, 1)' + W, 'JT'], ['oracle', 'SELECT SUBSTR(F_NAME, 1, 1) || SUBSTR(L_NAME, 1, 1)' + W, 'JT'], ['postgresql', 'SELECT RIGHT(L_NAME, 3)' + W, 'mas'],
  ['postgresql', 'SELECT SUBSTRING(L_NAME FROM 2 FOR 3)' + W, 'hom'], ['access', 'SELECT Mid(L_NAME, 2, 3)' + W, 'hom'], ['sqlserver', "SELECT CHARINDEX('a', L_NAME)" + W, 5], ['postgresql', "SELECT POSITION('a' IN L_NAME)" + W, 5],
  ['mysql', "SELECT LOCATE('a', L_NAME)" + W, 5], ['postgresql', "SELECT STRPOS(L_NAME, 'a')" + W, 5], ['oracle', 'SELECT INITCAP(UPPER(F_NAME))' + W, 'John'], ['sqlserver', 'SELECT REVERSE(F_NAME)' + W, 'nhoJ'],
  ['sqlserver', "SELECT REPLICATE('*', 3) + F_NAME" + W, '***John'], ['oracle', "SELECT LPAD(ID, 5, '0')" + W, '000E1'], ['mysql', "SELECT RPAD(F_NAME, 6, '.')" + W, 'John..'],
  ['postgresql', "SELECT SPLIT_PART(ADDRESS, ',', 2)" + W, ' OakPark'], ['mysql', "SELECT SUBSTRING_INDEX(ADDRESS, ',', -1)" + W, 'IL'], ['sqlserver', "SELECT UPPER(LTRIM(RTRIM('  ab  ')))" + W, 'AB'],
  ['postgresql', "SELECT STRING_AGG(F_NAME, ', ' ORDER BY F_NAME) FROM EMP", 'Alice, John, Steve'], ['sqlserver', "SELECT STRING_AGG(F_NAME, '; ') WITHIN GROUP (ORDER BY F_NAME DESC) FROM EMP", 'Steve; John; Alice'],
  ['mysql', "SELECT GROUP_CONCAT(F_NAME ORDER BY F_NAME SEPARATOR '|') FROM EMP", 'Alice|John|Steve'], ['oracle', "SELECT LISTAGG(F_NAME, ',') WITHIN GROUP (ORDER BY F_NAME) FROM EMP", 'Alice,John,Steve'],
  ['mysql', "SELECT COUNT(*) FROM EMP WHERE ADDRESS REGEXP ',IL$'", 2], ['postgresql', "SELECT COUNT(*) FROM EMP WHERE ADDRESS ~ '^[0-9]{3} '", 2], ['oracle', "SELECT REGEXP_REPLACE(ADDRESS, '[0-9]', '#')" + W, '#### Rice, OakPark,IL'],
  ['sqlserver', "SELECT COUNT(*) FROM EMP WHERE ADDRESS LIKE '%IL%'", 2], ['sqlserver', "SELECT SOUNDEX('Robert')" + W, 'R163'],
  // dates (fixed dates)
  ['sqlserver', "SELECT FORMAT(B_DATE, 'MMMM d, yyyy')" + W, 'January 9, 1976'], ['mysql', "SELECT DATE_FORMAT(B_DATE, '%M %e, %Y')" + W, 'January 9, 1976'],
  ['postgresql', "SELECT TO_CHAR(B_DATE, 'FMMonth FMDD, YYYY')" + W, 'January 9, 1976'], ['oracle', "SELECT TO_CHAR(B_DATE, 'fmMonth DD, YYYY')" + W, 'January 9, 1976'], ['access', "SELECT Format(B_DATE, 'mmmm d, yyyy')" + W, 'January 9, 1976'],
  ['sqlserver', 'SELECT CONVERT(VARCHAR(12), B_DATE, 107)' + W, 'Jan 09, 1976'], ['sqlserver', 'SELECT CONVERT(VARCHAR, B_DATE, 103)' + W, '09/01/1976'],
  ['sqlserver', 'SELECT DATENAME(MONTH, B_DATE)' + W, 'January'], ['sqlserver', 'SELECT DATENAME(WEEKDAY, B_DATE)' + W, 'Friday'], ['mysql', 'SELECT MONTHNAME(B_DATE), DAYNAME(B_DATE)' + W, 'January'],
  ['oracle', "SELECT TO_CHAR(B_DATE, 'Day')" + W, 'Friday   '], ['access', 'SELECT MonthName(Month(B_DATE))' + W, 'January'], ['sqlserver', 'SELECT EOMONTH(B_DATE)' + W, '1976-01-31'], ['oracle', 'SELECT LAST_DAY(B_DATE)' + W, '1976-01-31'],
  ['sqlserver', 'SELECT DATEADD(MONTH, 1, B_DATE)' + W, '1976-02-09'], ['mysql', 'SELECT DATE_ADD(B_DATE, INTERVAL 10 DAY)' + W, '1976-01-19'], ['postgresql', "SELECT B_DATE + INTERVAL '1 year'" + W, '1977-01-09'],
  ['oracle', 'SELECT ADD_MONTHS(B_DATE, 12)' + W, '1977-01-09'], ['postgresql', "SELECT DATE '2020-12-31' - B_DATE" + W, 16428], ['mysql', "SELECT DATEDIFF('2020-12-31', B_DATE)" + W, 16428],
  ['sqlserver', "SELECT DATEDIFF(DAY, B_DATE, '2020-12-31')" + W, 16428], ['sqlserver', 'SELECT YEAR(B_DATE), MONTH(B_DATE), DAY(B_DATE)' + W, 1976], ['postgresql', 'SELECT EXTRACT(DOW FROM B_DATE)' + W, 5],
  ['sqlserver', 'SELECT DATEFROMPARTS(2020, 12, 31)' + W, '2020-12-31'], ['postgresql', 'SELECT MAKE_DATE(2020, 2, 29)' + W, '2020-02-29'],
  // age at a date (exact completed years)
  ['mysql', "SELECT TIMESTAMPDIFF(YEAR, B_DATE, '2020-12-31')" + ALL, [44, 48, 40]], ['postgresql', "SELECT EXTRACT(YEAR FROM AGE(DATE '2020-06-30', B_DATE))" + ALL, [44, 47, 39]],
  ['oracle', "SELECT TRUNC(MONTHS_BETWEEN(DATE '2020-06-30', B_DATE) / 12)" + ALL, [44, 47, 39]],
  ['sqlserver', "SELECT DATEDIFF(YEAR, B_DATE, '2020-06-30') - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, B_DATE, '2020-06-30'), B_DATE) > '2020-06-30' THEN 1 ELSE 0 END" + ALL, [44, 47, 39]],
  ['sqlserver', "SELECT FLOOR(DATEDIFF(DAY, B_DATE, CAST('2020-06-30' AS DATE)) / 365.25)" + ALL, [44, 47, 39]], ['access', "SELECT DateDiff('yyyy', B_DATE, #12/31/2020#)" + ALL, [44, 48, 40]],
  ['postgresql', "SELECT DATE_PART('year', AGE('2020-12-31', B_DATE))" + ALL, [44, 48, 40]],
  // numbers / stats
  ['sqlserver', 'SELECT ROUND(SALARY / 3.0, -3)' + W, 33000], ['oracle', 'SELECT ROUND(SALARY / 3, 2)' + W, 33333.33], ['mysql', 'SELECT TRUNCATE(SALARY / 3, 1)' + W, 33333.3],
  ['postgresql', 'SELECT CEIL(SALARY / 7.0), FLOOR(SALARY / 7.0)' + W, 14286], ['sqlserver', 'SELECT CEILING(2.1) + ABS(-1) + POWER(2, 3) + SQRT(16) + 7 % 3' + W, 17], ['oracle', 'SELECT MOD(17, 5)' + W, 2],
  ['sqlserver', 'SELECT AVG(SALARY), SUM(SALARY), MIN(SALARY), MAX(SALARY), COUNT(DISTINCT DEP) FROM EMP', 230000 / 3], ['sqlserver', 'SELECT ROUND(STDEV(SALARY), 2) FROM EMP', 25166.11],
  ['oracle', 'SELECT ROUND(STDDEV(SALARY), 2) FROM EMP', 25166.11], ['mysql', 'SELECT ROUND(STDDEV(SALARY), 2) FROM EMP', 20548.05], ['postgresql', 'SELECT VAR_POP(SALARY) FROM EMP', 422222222.2222222],
  ['access', 'SELECT ROUND(StDev(SALARY), 0) FROM EMP', 25166], ['oracle', 'SELECT MEDIAN(SALARY) FROM EMP', 80000], ['postgresql', 'SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY SALARY) FROM EMP', 80000],
  ['sqlserver', 'SELECT ROUND(STDEV(SALARY) OVER (), 2)' + ALL, [25166.11, 25166.11, 25166.11]], ['sqlserver', "SELECT FORMAT(SALARY, 'N0')" + W, '100,000'], ['sqlserver', "SELECT FORMAT(SALARY, 'C')" + W, '$100,000.00'],
  ['mysql', 'SELECT FORMAT(SALARY, 2)' + W, '100,000.00'], ['oracle', "SELECT TO_CHAR(SALARY, 'FM999,999')" + W, '100,000'],
  ['sqlserver', 'SELECT RANK() OVER (ORDER BY SALARY DESC)' + ALL, [1, 2, 3]], ['sqlserver', 'SELECT SUM(SALARY) OVER (ORDER BY ID)' + ALL, [100000, 180000, 230000]],
  ['postgresql', 'SELECT LAG(SALARY) OVER (ORDER BY ID)' + ALL, [null, 100000, 80000]], ['sqlserver', 'SELECT NTILE(2) OVER (ORDER BY ID)' + ALL, [1, 1, 2]],
  // conditions / casts
  ['sqlserver', "SELECT CASE WHEN SALARY >= 90000 THEN 'High' WHEN SALARY >= 60000 THEN 'Mid' ELSE 'Low' END" + ALL, ['High', 'Mid', 'Low']], ['sqlserver', "SELECT IIF(SALARY > 70000, 'Y', 'N')" + ALL, ['Y', 'Y', 'N']],
  ['mysql', "SELECT IF(SALARY > 70000, 'Y', 'N')" + ALL, ['Y', 'Y', 'N']], ['sqlserver', "SELECT ISNULL(MID, 'none')" + ALL, ['none', 'E1', 'E1']], ['oracle', "SELECT NVL(MID, 'none')" + W, 'none'],
  ['access', "SELECT Nz(MID, 'none')" + W, 'none'], ['oracle', "SELECT NVL2(MID, 'has', 'none')" + W, 'none'], ['oracle', "SELECT DECODE(DEP, 2, 'Two', 5, 'Five', 'Other')" + ALL, ['Two', 'Five', 'Five']],
  ['postgresql', 'SELECT NULLIF(DEP, 5)' + ALL, [2, null, null]], ['sqlserver', 'SELECT CAST(SALARY AS VARCHAR(10)) + \' USD\'' + W, '100000 USD'], ['sqlserver', 'SELECT CAST(SALARY / 3.0 AS DECIMAL(10, 2))' + W, 33333.33],
  ['sqlserver', "SELECT TRY_CAST('12' AS INT) + 1" + W, 13], ['postgresql', "SELECT '5'::int + 1" + W, 6], ['access', 'SELECT IIf(SALARY > 70000, "Y", "N")'.replace(/"/g, "'") + W, 'Y'],
  ['mysql', "SELECT GREATEST(1, DEP, 3)" + W, 3], ['sqlserver', "SELECT CHOOSE(2, 'a', 'b', 'c')" + W, 'b'],
];
module.exports = { T, D, C };
