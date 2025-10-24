import ky from "ky";
import { PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const BASE_URL = "http://www.sfu.ca/bin/wcm/course-outlines";

const prisma = new PrismaClient();

async function scrapeYears() {
	const years = await ky.get(BASE_URL).json();

	try {
		await prisma.year.createMany({
			data: Array.from(years),
		});
	} catch (error) {
		if (error.code == "P2002") {
			console.error(
				`Failed unique constraint on: ${error.meta.modelName}`
			);
		}
	}
}

async function scrapeTerms() {
	const years = await prisma.year.findMany();

	// console.log(years);
	years.forEach(async (year) => {
		const termResponse = await ky.get(BASE_URL + `?${year.value}`).json();
		const termData = Array.from(termResponse).map((term) => {
			return {
				...term,
				yearId: year.id,
			};
		});
		try {
			await prisma.term.createMany({
				data: termData,
			});
		} catch (error) {
			if (error.code == "P2002") {
				console.error(
					`Failed unique constraint on: ${error.meta.modelName}`,
					termData
				);
			}
		}
	});
}

async function scrapeDepartments() {
	const terms = await prisma.term.findMany({
		include: {
			year: true,
		},
	});

	terms.forEach(async (term) => {
		const year = term.year.value;

		const departmentResponse = await ky
			.get(BASE_URL + `?${year}/${term.value}`, {
				retry: {
					limit: 10,
					retryOnTimeout: true,
				},
			})
			.json();

		const departmentData = Array.from(departmentResponse).map(
			(department) => {
				return {
					...department,
					termId: term.id,
				};
			}
		);

		try {
			await prisma.department.createMany({
				data: departmentData,
			});
		} catch (error) {
			if (error.code == "P2002") {
				console.error(
					`Failed unique constraint on: ${error.meta.modelName}`,
					departmentData
				);
			}
		}
	});
}

async function scrapeCourseNumbers() {
	const departments = await prisma.department.findMany({
		include: {
			term: {
				include: {
					year: true,
				},
			},
		},
	});

	departments.forEach(async (department) => {
		const term = department.term.value;
		const year = department.term.year.value;

		try {
			const courseNumberResponse = await ky
				.get(BASE_URL + `?${year}/${term}/${department.value}`, {
					retry: {
						limit: 10,
						retryOnTimeout: true,
					},
				})
				.json();

			const courseNumberData = Array.from(courseNumberResponse).map(
				(courseNumber) => {
					return {
						...courseNumber,
						departmentId: department.id,
					};
				}
			);

			try {
				await prisma.courseNumber.createMany({
					data: courseNumberData,
				});
			} catch (error) {
				if (error.code == "P2002") {
					console.error(
						`Failed unique constraint on: ${error.meta.modelName}`,
						courseNumberData
					);
				}
			}
		} catch (error) {
			console.error(error.response.status, department.value, term, year);
		}
	});
}

async function scrapeSections() {
	const courseNumbers = await prisma.courseNumber.findMany({
		where: {
			department: {
				term: {
					year: {
						value: "2014",
					},
				},
			},
		},
		include: {
			department: {
				include: {
					term: {
						include: {
							year: true,
						},
					},
				},
			},
		},
	});

	courseNumbers.forEach(async (courseNumber, i) => {
		const department = courseNumber.department;
		const term = courseNumber.department.term;
		const year = courseNumber.department.term.year;

		try {
			const url = `${BASE_URL}?${year.value}/${term.value}/${department.value}/${courseNumber.value}`;

			const sectionResponse = await ky
				.get(url, {
					retry: {
						limit: 15,
						retryOnTimeout: true,
					},
				})
				.json();

			// console.log(`scraping ${i + 1}/${courseNumbers.length} sections`);

			const sectionData = Array.from(sectionResponse).map((section) => {
				return {
					...section,
					courseNumberId: courseNumber.id,
				};
			});

			try {
				await prisma.section.createMany({
					data: sectionData,
				});
			} catch (error) {
				if (error.code == "P2002") {
					console.error(
						`Failed unique constraint on: ${error.meta.modelName}`,
						sectionData
					);
				} else {
					console.error(error);
				}
			}
		} catch (error) {
			console.error(
				error.response.status,
				courseNumber.value,
				department.value,
				term.value,
				year.value
			);
		}
	});
}

async function scrapeCourseOutlines() {
	const sections = await prisma.section.findMany({
		where: {
			courseNumber: {
				department: {
					term: {
						year: {
							value: "2014",
						},
					},
				},
			},
		},
		include: {
			courseNumber: {
				include: {
					department: {
						include: {
							term: {
								include: {
									year: true,
								},
							},
						},
					},
				},
			},
		},
	});

	sections.forEach(async (section) => {
		const courseNumber = section.courseNumber;
		const department = courseNumber.department;
		const term = courseNumber.department.term;
		const year = courseNumber.department.term.year;

		try {
			const url = `${BASE_URL}?${year.value}/${term.value}/${department.value}/${courseNumber.value}/${section.value}`;

			const courseOutlineResponse = await ky
				.get(url, {
					retry: {
						limit: 15,
						retryOnTimeout: true,
					},
				})
				.json();

			// console.log(`scraping ${i + 1}/${courseNumbers.length} sections`);

			const data = {
				...courseOutlineResponse.info,
				instructors: courseOutlineResponse.instructors,
				courseSchedule: courseOutlineResponse.courseSchedule,
				grades: courseOutlineResponse.grades,
				requiredTexts: courseOutlineResponse.requiredTexts,
				sectionId: section.id,
			};

			try {
				await prisma.courseOutline.create({
					data: data,
				});
			} catch (error) {
				if (error.code == "P2002") {
					console.error(
						`Failed unique constraint on: ${error.meta.modelName}`,
						sectionData
					);
				} else {
					console.error(error);
				}
			}
		} catch (error) {
			console.error(
				error.response.status,
				courseNumber.value,
				department.value,
				term.value,
				year.value
			);
		}
	});
}

// async function scrapeDepartments() {
// 	const terms = await prisma.term.findMany();

// 	await terms.forEach(async (termObj) => {
// 		const term = termObj.term;
// 		const year = termObj.year;

// 		const responseJson = await ky
// 			.get(BASE_URL + `?${year}/${term}`, {
// 				retry: {
// 					retryOnTimeout: true,
// 				},
// 			})
// 			.json();

// 		responseJson.forEach(async (department) => {
// 			const name = department.name ?? undefined;

// 			try {
// 				await prisma.department.create({
// 					data: {
// 						department: department.text,
// 						value: department.value,
// 						name: name,
// 						term: term,
// 						year: year,
// 					},
// 				});
// 			} catch (error) {
// 				if (error.code != "P2002") console.error(error);
// 			}
// 		});
// 	});
// }

// async function scrapeCourseNumbers() {
// 	const departments = await prisma.department.findMany();

// 	departments.forEach(async (departmentObj) => {
// 		const department = departmentObj.department;
// 		const term = departmentObj.term;
// 		const year = departmentObj.year;

// 		try {
// 			const responseJson = await ky
// 				.get(BASE_URL + `?${year}/${term}/${department}`, {
// 					retry: {
// 						retryOnTimeout: true,
// 					},
// 				})
// 				.json();

// 			// modify it to include foreign key data and alter "text" field to be more descriptive
// 			const alteredData = Array.from(responseJson).map((obj) => {
// 				return {
// 					courseNumber: obj.text,
// 					value: obj.value,
// 					title: obj.title ?? "",
// 					department: department,
// 					term: term,
// 					year: year,
// 				};
// 			});

// 			try {
// 				await prisma.courseNumber.createMany({
// 					data: alteredData,
// 				});
// 			} catch (error) {
// 				if (error.code != "P2002") console.error(error);
// 			}
// 		} catch (error) {
// 			if (error.response.status != 404) console.error(error);
// 		}
// 	});
// }

// async function scrapeSections() {
// 	// const courseNumbers = await prisma.courseNumber.findMany({
// 	// 	where: {
// 	// 		year: 2022,
// 	// 		OR: {
// 	// 			year: 2023,
// 	// 		},
// 	// 	},
// 	// });

// 	const courseNumbers =
// 		await prisma.$queryRaw`SELECT * FROM CourseNumber WHERE year BETWEEN 2022 AND 2026`;

// 	courseNumbers.forEach(async (courseNumberObj) => {
// 		const courseNumber = courseNumberObj.courseNumber;
// 		const department = courseNumberObj.department;
// 		const term = courseNumberObj.term;
// 		const year = courseNumberObj.year;

// 		try {
// 			const responseJson = await ky
// 				.get(
// 					BASE_URL + `?${year}/${term}/${department}/${courseNumber}`,
// 					{
// 						retry: {
// 							limit: 10,
// 							retryOnTimeout: true,
// 						},
// 					}
// 				)
// 				.json();

// 			// modify it to include foreign key data and alter "text" field to be more descriptive
// 			const alteredData = Array.from(responseJson).map((obj) => {
// 				return {
// 					section: obj.text,
// 					value: obj.value,
// 					title: obj.title ?? "",
// 					classType: obj.classType,
// 					sectionCode: obj.sectionCode,
// 					associatedClass: obj.associatedClass,
// 					courseNumber: courseNumber,
// 					department: department,
// 					term: term,
// 					year: year,
// 				};
// 			});

// 			try {
// 				await prisma.section.createMany({
// 					data: alteredData,
// 				});
// 			} catch (error) {
// 				if (error.code != "P2002") console.error(error);
// 			}
// 		} catch (error) {
// 			if (error.response?.status != 404) console.error(error);
// 		}
// 	});
// }

// async function scrapeCourseOutlines() {
// 	const sections = await prisma.section.findMany({
// 		where: {
// 			year: 2014,
// 		},
// 	});

// 	sections.forEach(async (sectionObj) => {
// 		const section = sectionObj.section;
// 		const courseNumber = sectionObj.courseNumber;
// 		const department = sectionObj.department;
// 		const term = sectionObj.term;
// 		const year = sectionObj.year;

// 		try {
// 			const responseJson = await ky
// 				.get(
// 					BASE_URL +
// 						`?${year}/${term}/${department}/${courseNumber}/${section}`,
// 					{
// 						retry: {
// 							limit: 10,
// 							retryOnTimeout: true,
// 						},
// 					}
// 				)
// 				.json();

// 			const infoWithFK = {
// 				...responseJson.info,
// 				instructors: responseJson.instructors,
// 				schedule: responseJson.courseSchedule,
// 				gradingComponents: responseJson.grades,
// 				requiredTexts: responseJson.requiredTexts,
// 				courseNumber: courseNumber,
// 				department: department,
// 				termStr: term,
// 				year: year,
// 			};

// 			try {
// 				await prisma.courseOutline.create({
// 					data: infoWithFK,
// 				});
// 			} catch (error) {
// 				if (error.code != "P2002") console.error(error);
// 				// console.error(error);
// 			}

// 			const courseName = infoWithFK.name;

// 			const subsectionScrape = async (sub, table) => {
// 				if (sub) {
// 					const propWithFK = Array.from(sub).map((subObj) => {
// 						return {
// 							...subObj,
// 							courseName: courseName,
// 							section: section,
// 							courseNumber: courseNumber,
// 							department: department,
// 							term: term,
// 							year: year,
// 						};
// 					});

// 					try {
// 						await table.createMany({
// 							data: propWithFK,
// 							skipDuplicates: true,
// 						});
// 					} catch (error) {
// 						if (error.code != "P2002") {
// 							console.error(error);
// 							console.log(propWithFK);
// 						}
// 					}
// 				}
// 			};

// 			// subsectionScrape(responseJson.instructor, prisma.instructor);
// 			// subsectionScrape(
// 			// 	responseJson.courseSchedule,
// 			// 	prisma.courseSchedule
// 			// );
// 			// subsectionScrape(responseJson.grades, prisma.gradingComponent);
// 			// subsectionScrape(responseJson.requiredText, prisma.requiredText);
// 		} catch (error) {
// 			if (error.response?.status != 404) console.error(error);
// 		}
// 	});
// }

// await scrapeYears();
// await scrapeTerms();
// await scrapeDepartments();
// await scrapeCourseNumbers();
// await scrapeSections();
await scrapeCourseOutlines();

/*[
  { text: '2014', value: '2014' },
  { text: '2015', value: '2015' },
  { text: '2016', value: '2016' },
  { text: '2017', value: '2017' },
  { text: '2018', value: '2018' },
  { text: '2019', value: '2019' },
  { text: '2020', value: '2020' },
  { text: '2021', value: '2021' },
  { text: '2022', value: '2022' },
  { text: '2023', value: '2023' },
  { text: '2024', value: '2024' },
  { text: '2025', value: '2025' },
  { text: '2026', value: '2026' }
]*/

// const terms = await ky.get(BASE_URL + "?2025").json();
// /*
// [
//   { text: 'FALL', value: 'fall' },
//   { text: 'SPRING', value: 'spring' },
//   { text: 'SUMMER', value: 'summer' }
// ]
// */
// console.log(terms);
