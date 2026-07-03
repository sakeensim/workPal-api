const prisma = require("../configs/prisma");
const { createNotification } = require("../services/notification-service");

const BANGKOK_TIMEZONE = "Asia/Bangkok";
const MAX_HISTORY_DAYS = 90;
const DEFAULT_HISTORY_DAYS = 30;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const REQUEST_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELED: "CANCELED",
});

const REQUEST_ACTION = Object.freeze({
  APPROVE: "APPROVE_REQUEST",
  REJECT: "REJECT_REQUEST",
});

const REQUEST_ENTITY = Object.freeze({
  DAY_OFF: "DayOff",
  ADVANCE_SALARY: "AdvanceSalary",
});

const REQUEST_TYPE = Object.freeze({
  DAY_OFF: "DAY_OFF",
  ADVANCE: "ADVANCE",
});

const bangkokDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BANGKOK_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getBangkokDateString = (date = new Date()) => {
  return bangkokDateFormatter.format(new Date(date));
};

const getBangkokDayRange = (dateInput = new Date()) => {
  const bangkokDate = getBangkokDateString(dateInput);

  return {
    start: new Date(`${bangkokDate}T00:00:00.000+07:00`),
    end: new Date(`${bangkokDate}T23:59:59.999+07:00`),
  };
};

const getBangkokMonthRange = (year, month) => {
  const monthString = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const lastDayString = String(lastDay).padStart(2, "0");

  return {
    start: new Date(`${year}-${monthString}-01T00:00:00.000+07:00`),
    end: new Date(`${year}-${monthString}-${lastDayString}T23:59:59.999+07:00`),
  };
};

const getBangkokYearMonth = (date = new Date()) => {
  const [year, month] = getBangkokDateString(date).split("-").map(Number);

  return { year, month };
};

const isSameYearMonth = (dateA, dateB) => {
  return (
    Number(dateA?.year) === Number(dateB?.year) &&
    Number(dateA?.month) === Number(dateB?.month)
  );
};

const getBangkokDaysAgoStart = (days = DEFAULT_HISTORY_DAYS) => {
  const { start } = getBangkokDayRange(new Date());
  start.setDate(start.getDate() - days);

  return start;
};

const toBangkokDateKey = (date) => getBangkokDateString(date);

const makeHttpError = (statusCode, message, extra = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);

  return error;
};

const controller = (name, handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    console.error(`Error in ${name}:`, error);

    if (error.statusCode && !res.headersSent) {
      const payload = { message: error.message };
      if (error.data !== undefined) payload.data = error.data;

      return res.status(error.statusCode).json(payload);
    }

    if (!res.headersSent) return next(error);
  }
};

const isAdminOrOwner = (user) => {
  return user?.role === "ADMIN" || user?.role === "OWNER";
};

const assertAdminOrOwner = (user) => {
  if (!isAdminOrOwner(user)) {
    throw makeHttpError(403, "Not authorized");
  }
};

const getRequestId = (id) => {
  const parsed = Number(id);

  if (!Number.isInteger(parsed) || parsed <= 0) return null;

  return parsed;
};

const assertRequestId = (id) => {
  const requestId = getRequestId(id);

  if (!requestId) {
    throw makeHttpError(400, "Invalid request id");
  }

  return requestId;
};

const isActiveRecord = (record) => {
  return record && record.isActive === true && record.isDeleted === false;
};

const isEmployeeActive = isActiveRecord;
const isBranchActive = isActiveRecord;
const isPositionActive = isActiveRecord;

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
});

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
});

const getActivePositionWhere = () => ({
  isActive: true,
  isDeleted: false,
});

const getActiveStoreHolidayWhere = () => ({
  isDeleted: false,
});

const getEmployeeFullName = (employee) => {
  return [employee?.firstname, employee?.lastname].filter(Boolean).join(" ");
};

const getPositionBranchErrorMessage = () => {
  return "ตำแหน่งของพนักงานไม่ตรงกับสาขา หรือถูกปิดใช้งานแล้ว";
};

const isEmployeeBranchValid = (employee) => {
  if (!employee?.branchId) return true;

  return isBranchActive(employee.branch);
};

const isEmployeePositionValid = (employee) => {
  if (!employee?.positionId) return false;
  if (!isPositionActive(employee.position)) return false;

  return Number(employee.position.branchId) === Number(employee.branchId);
};

const requestEmployeeInclude = {
  branch: true,
  position: {
    include: {
      branch: true,
    },
  },
};

const requestInclude = {
  employees: {
    include: requestEmployeeInclude,
  },
};

const safeCreateNotification = async (payload) => {
  try {
    await createNotification(payload);
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

const createAudit = (tx, req, data) => {
  return tx.auditLog.create({
    data: {
      actorId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      ...data,
    },
  });
};

const formatEmployee = (employee) => {
  if (!employee) return null;

  const validPosition =
    employee.position &&
    employee.position.isActive &&
    !employee.position.isDeleted &&
    Number(employee.position.branchId) === Number(employee.branchId)
      ? employee.position
      : null;

  return {
    id: employee.id,
    firstName: employee.firstname,
    lastName: employee.lastname,
    firstname: employee.firstname,
    lastname: employee.lastname,
    email: employee.email,
    role: employee.role || null,
    profileImage: employee.profileImage || null,
    branchId: employee.branchId || null,
    branch: employee.branch || null,
    positionId: employee.positionId || null,
    position: validPosition,
  };
};

const assertReviewableRequest = (request, notFoundMessage, actionText) => {
  if (!request) {
    throw makeHttpError(404, notFoundMessage);
  }

  if (request.status !== REQUEST_STATUS.PENDING) {
    throw makeHttpError(400, `Only pending requests can be ${actionText}`);
  }
};

const assertReviewableEmployee = (employee, options = {}) => {
  const { requirePosition = false } = options;

  if (!isEmployeeActive(employee)) {
    throw makeHttpError(404, "Employee not found or inactive");
  }

  if (!isEmployeeBranchValid(employee)) {
    throw makeHttpError(400, "สาขาของพนักงานถูกปิดใช้งานหรือถูกลบแล้ว");
  }

  if (requirePosition && !isEmployeePositionValid(employee)) {
    throw makeHttpError(400, getPositionBranchErrorMessage());
  }
};

const getRequestSortTime = (request) => {
  return new Date(
    request.updatedAt || request.requestDate || request.date || request.createdAt
  ).getTime();
};

const formatSalaryRequest = (request) => ({
  id: request.id,
  type: "salary",
  amount: request.amount,
  requestDate: request.requestDate,
  status: request.status,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  employee: formatEmployee(request.employees),
});

const formatDayOffRequest = (request) => ({
  id: request.id,
  type: "dayoff",
  reason: request.reason,
  date: request.date,
  startDate: request.date,
  endDate: request.date,
  status: request.status,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  employee: formatEmployee(request.employees),
});

const getRequestWhere = ({ includeHistory, days }) => {
  const baseWhere = {
    employees: {
      is: getActiveEmployeeWhere(),
    },
  };

  if (!includeHistory) {
    return {
      ...baseWhere,
      status: REQUEST_STATUS.PENDING,
    };
  }

  return {
    AND: [
      baseWhere,
      {
        OR: [
          {
            status: REQUEST_STATUS.PENDING,
          },
          {
            status: {
              in: [REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED],
            },
            updatedAt: {
              gte: getBangkokDaysAgoStart(days),
            },
          },
        ],
      },
    ],
  };
};

const buildAdvanceAuditData = ({ status, salaryRequest, employee }) => ({
  action:
    status === REQUEST_STATUS.APPROVED
      ? REQUEST_ACTION.APPROVE
      : REQUEST_ACTION.REJECT,
  entity: REQUEST_ENTITY.ADVANCE_SALARY,
  entityId: salaryRequest.id,
  targetEmployeeId: employee.id,
  branchId: employee.branchId,
  oldValue: {
    status: salaryRequest.status,
  },
  newValue: {
    status,
    requestType: REQUEST_TYPE.ADVANCE,
    amount: Number(salaryRequest.amount),
    requestDate: salaryRequest.requestDate
      ? salaryRequest.requestDate.toISOString()
      : null,
  },
  note: `${
    status === REQUEST_STATUS.APPROVED ? "Approve" : "Reject"
  } advance salary ${Number(salaryRequest.amount)} baht for ${getEmployeeFullName(
    employee
  )}`,
});

const buildDayOffAuditData = ({
  status,
  dayOffRequest,
  employee,
  oldRemainingDayOffs,
  newRemainingDayOffs,
  dayOffQuotaInfo,
  cancelReason,
}) => {
  const isApproved = status === REQUEST_STATUS.APPROVED;

  return {
    action: isApproved ? REQUEST_ACTION.APPROVE : REQUEST_ACTION.REJECT,
    entity: REQUEST_ENTITY.DAY_OFF,
    entityId: dayOffRequest.id,
    targetEmployeeId: employee.id,
    branchId: employee.branchId,
    oldValue: {
      status: dayOffRequest.status,
      ...(oldRemainingDayOffs !== undefined
        ? { remainingDayOffs: oldRemainingDayOffs }
        : {}),
    },
    newValue: {
      status,
      requestType: REQUEST_TYPE.DAY_OFF,
      date: dayOffRequest.date ? dayOffRequest.date.toISOString() : null,
      reason: dayOffRequest.reason,
      ...(newRemainingDayOffs !== undefined
        ? { remainingDayOffs: newRemainingDayOffs }
        : {}),
      ...(dayOffQuotaInfo ? { dayOffQuotaInfo } : {}),
      ...(cancelReason ? { cancelReason } : {}),
    },
    note: `${
      isApproved
        ? "Approve"
        : status === REQUEST_STATUS.CANCELED
        ? "Cancel"
        : "Reject"
    } day-off request for ${getEmployeeFullName(employee)}`,
  };
};

const sendAdvanceReviewNotification = ({
  status,
  salaryRequest,
  employeeId,
  createdById,
}) => {
  const isApproved = status === REQUEST_STATUS.APPROVED;

  return safeCreateNotification({
    type: isApproved ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
    title: isApproved ? "คำขอเบิกเงินได้รับอนุมัติ" : "คำขอเบิกเงินถูกปฏิเสธ",
    message: isApproved
      ? `คำขอเบิกเงิน ${Number(
          salaryRequest.amount
        ).toLocaleString()} บาทของคุณได้รับอนุมัติแล้ว`
      : "คำขอเบิกเงินล่วงหน้าของคุณถูกปฏิเสธ",
    link: "/user/history",
    entity: REQUEST_ENTITY.ADVANCE_SALARY,
    entityId: salaryRequest.id,
    targetType: "USER",
    targetUserIds: [employeeId],
    createdById,
  });
};

const sendDayOffReviewNotification = ({
  status,
  dayOffRequest,
  employeeId,
  createdById,
}) => {
  const isApproved = status === REQUEST_STATUS.APPROVED;
  const isCanceled = status === REQUEST_STATUS.CANCELED;

  return safeCreateNotification({
    type: isApproved ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
    title: isApproved
      ? "คำขอลาได้รับอนุมัติ"
      : isCanceled
      ? "คำขอลาถูกยกเลิก"
      : "คำขอลาถูกปฏิเสธ",
    message: isApproved
      ? "คำขอลาของคุณได้รับอนุมัติแล้ว"
      : isCanceled
      ? "วันที่ขอลาเป็นวันหยุดของสาขา ระบบจึงยกเลิกคำขอ"
      : "คำขอลาของคุณถูกปฏิเสธ",
    link: "/user/history",
    entity: REQUEST_ENTITY.DAY_OFF,
    entityId: dayOffRequest.id,
    targetType: "USER",
    targetUserIds: [employeeId],
    createdById,
  });
};

const getAdvanceSalaryApprovalInfo = async (salaryRequest, employee) => {
  const { year, month } = getBangkokYearMonth(salaryRequest.requestDate);
  const { start: monthStart, end: monthEnd } = getBangkokMonthRange(year, month);

  const approvedThisMonth = await prisma.advanceSalary.aggregate({
    where: {
      employeesId: employee.id,
      status: REQUEST_STATUS.APPROVED,
      requestDate: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
    _sum: {
      amount: true,
    },
  });

  const baseSalary = Number(employee.baseSalary || 0);
  const usedAdvance = Number(approvedThisMonth._sum.amount || 0);
  const requestAmount = Number(salaryRequest.amount || 0);
  const remainingAdvanceSalary = baseSalary - usedAdvance;

  if (baseSalary <= 0) {
    throw makeHttpError(400, "ยังไม่ได้กำหนดเงินเดือนพื้นฐาน");
  }

  if (requestAmount > remainingAdvanceSalary) {
    throw makeHttpError(
      400,
      `Approve ไม่ได้ เบิกล่วงหน้าได้อีกไม่เกิน ${remainingAdvanceSalary} บาท`
    );
  }

  return {
    requestAmount,
    remainingAdvanceSalary,
  };
};

const updateAdvanceSalaryStatus = async ({
  req,
  salaryRequest,
  employee,
  status,
}) => {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.advanceSalary.update({
      where: {
        id: salaryRequest.id,
      },
      data: {
        status,
      },
      include: {
        employees: true,
      },
    });

    await createAudit(
      tx,
      req,
      buildAdvanceAuditData({ status, salaryRequest, employee })
    );

    return updated;
  });
};

const isDayOffOnStoreHoliday = async ({ date, branchId }) => {
  const { start, end } = getBangkokDayRange(date);

  return prisma.storeHoliday.findFirst({
    where: {
      ...getActiveStoreHolidayWhere(),
      branchId,
      date: {
        gte: start,
        lte: end,
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    },
  });
};

const cancelDayOffBecauseHoliday = async ({ req, dayOffRequest, employee }) => {
  const canceledRequest = await prisma.$transaction(async (tx) => {
    const canceled = await tx.dayOff.update({
      where: {
        id: dayOffRequest.id,
      },
      data: {
        status: REQUEST_STATUS.CANCELED,
      },
      include: {
        employees: true,
      },
    });

    await createAudit(
      tx,
      req,
      buildDayOffAuditData({
        status: REQUEST_STATUS.CANCELED,
        dayOffRequest,
        employee,
        cancelReason: "STORE_HOLIDAY",
      })
    );

    return canceled;
  });

  await sendDayOffReviewNotification({
    status: REQUEST_STATUS.CANCELED,
    dayOffRequest,
    employeeId: employee.id,
    createdById: req.user.id,
  });

  return canceledRequest;
};

const getDayOffApprovalInfo = async ({ tx, dayOffRequest, employee }) => {
  const currentYearMonth = getBangkokYearMonth(new Date());
  const requestYearMonth = getBangkokYearMonth(dayOffRequest.date);
  const isCurrentMonth = isSameYearMonth(currentYearMonth, requestYearMonth);

  const remainingDayOffs = Number(employee.remainingDayOffs || 0);
  const maxDayOffPerMonth = Number(employee.position?.maxDayOffPerMonth || 0);

  if (isCurrentMonth) {
    if (remainingDayOffs <= 0) {
      throw makeHttpError(400, "อนุมัติไม่ได้ วันลาคงเหลือไม่พอ");
    }

    return {
      isCurrentMonth: true,
      approveBy: "CURRENT_MONTH_REMAINING",
      shouldDecrementRemainingDayOffs: true,
      remainingDayOffs,
      newRemainingDayOffs: remainingDayOffs - 1,
      maxDayOffPerMonth,
      approvedDayOffInRequestMonth: null,
      monthQuotaRemainingBeforeApproval: null,
      monthQuotaRemainingAfterApproval: null,
    };
  }

  if (maxDayOffPerMonth <= 0) {
    throw makeHttpError(
      400,
      "ตำแหน่งนี้ยังไม่ได้กำหนดจำนวนวันลาต่อเดือน"
    );
  }

  const { start: requestMonthStart, end: requestMonthEnd } =
    getBangkokMonthRange(requestYearMonth.year, requestYearMonth.month);

  const approvedDayOffInRequestMonth = await tx.dayOff.count({
    where: {
      employeesId: employee.id,
      id: {
        not: dayOffRequest.id,
      },
      date: {
        gte: requestMonthStart,
        lte: requestMonthEnd,
      },
      status: REQUEST_STATUS.APPROVED,
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
    },
  });

  const monthQuotaRemainingBeforeApproval =
    maxDayOffPerMonth - approvedDayOffInRequestMonth;

  if (approvedDayOffInRequestMonth < maxDayOffPerMonth) {
    return {
      isCurrentMonth: false,
      approveBy: "REQUEST_MONTH_APPROVED_QUOTA",
      shouldDecrementRemainingDayOffs: false,
      remainingDayOffs,
      newRemainingDayOffs: remainingDayOffs,
      maxDayOffPerMonth,
      approvedDayOffInRequestMonth,
      monthQuotaRemainingBeforeApproval,
      monthQuotaRemainingAfterApproval: monthQuotaRemainingBeforeApproval - 1,
    };
  }

  if (remainingDayOffs <= 0) {
    throw makeHttpError(
      400,
      "อนุมัติไม่ได้ เดือนที่เลือกขอลาครบโควต้าแล้ว และวันลาคงเหลือไม่พอ"
    );
  }

  return {
    isCurrentMonth: false,
    approveBy: "CURRENT_REMAINING_FALLBACK",
    shouldDecrementRemainingDayOffs: true,
    remainingDayOffs,
    newRemainingDayOffs: remainingDayOffs - 1,
    maxDayOffPerMonth,
    approvedDayOffInRequestMonth,
    monthQuotaRemainingBeforeApproval,
    monthQuotaRemainingAfterApproval: 0,
  };
};

const approveDayOff = async ({ req, dayOffRequest, employee }) => {
  return prisma.$transaction(async (tx) => {
    const approvalInfo = await getDayOffApprovalInfo({
      tx,
      dayOffRequest,
      employee,
    });

    const approved = await tx.dayOff.update({
      where: {
        id: dayOffRequest.id,
      },
      data: {
        status: REQUEST_STATUS.APPROVED,
      },
      include: {
        employees: true,
      },
    });

    if (approvalInfo.shouldDecrementRemainingDayOffs) {
      const employeeUpdate = await tx.employees.updateMany({
        where: {
          id: employee.id,
          remainingDayOffs: {
            gt: 0,
          },
        },
        data: {
          remainingDayOffs: {
            decrement: 1,
          },
        },
      });

      if (employeeUpdate.count !== 1) {
        throw makeHttpError(400, "อนุมัติไม่ได้ วันลาคงเหลือไม่พอ");
      }
    }

    await createAudit(
      tx,
      req,
      buildDayOffAuditData({
        status: REQUEST_STATUS.APPROVED,
        dayOffRequest,
        employee,
        oldRemainingDayOffs: approvalInfo.remainingDayOffs,
        newRemainingDayOffs: approvalInfo.newRemainingDayOffs,
        dayOffQuotaInfo: {
          isCurrentMonth: approvalInfo.isCurrentMonth,
          approveBy: approvalInfo.approveBy,
          shouldDecrementRemainingDayOffs:
            approvalInfo.shouldDecrementRemainingDayOffs,
          maxDayOffPerMonth: approvalInfo.maxDayOffPerMonth,
          approvedDayOffInRequestMonth:
            approvalInfo.approvedDayOffInRequestMonth,
          monthQuotaRemainingBeforeApproval:
            approvalInfo.monthQuotaRemainingBeforeApproval,
          monthQuotaRemainingAfterApproval:
            approvalInfo.monthQuotaRemainingAfterApproval,
        },
      })
    );

    return approved;
  });
};

const rejectDayOff = async ({ req, dayOffRequest, employee }) => {
  return prisma.$transaction(async (tx) => {
    const rejected = await tx.dayOff.update({
      where: {
        id: dayOffRequest.id,
      },
      data: {
        status: REQUEST_STATUS.REJECTED,
      },
      include: {
        employees: true,
      },
    });

    await createAudit(
      tx,
      req,
      buildDayOffAuditData({
        status: REQUEST_STATUS.REJECTED,
        dayOffRequest,
        employee,
      })
    );

    return rejected;
  });
};

const handleSalaryRequestReview = async ({ req, res, status }) => {
  assertAdminOrOwner(req.user);

  const id = assertRequestId(req.params.id);
  const actionText = status === REQUEST_STATUS.APPROVED ? "approved" : "rejected";

  const salaryRequest = await prisma.advanceSalary.findUnique({
    where: { id },
    include: requestInclude,
  });

  assertReviewableRequest(
    salaryRequest,
    "Advance salary request not found",
    actionText
  );

  const employee = salaryRequest.employees;
  assertReviewableEmployee(employee);

  const approvalInfo =
    status === REQUEST_STATUS.APPROVED
      ? await getAdvanceSalaryApprovalInfo(salaryRequest, employee)
      : null;

  const updatedRequest = await updateAdvanceSalaryStatus({
    req,
    salaryRequest,
    employee,
    status,
  });

  await sendAdvanceReviewNotification({
    status,
    salaryRequest,
    employeeId: employee.id,
    createdById: req.user.id,
  });

  const response = {
    message:
      status === REQUEST_STATUS.APPROVED
        ? "Advance salary request approved successfully"
        : "Advance salary request rejected",
    data: updatedRequest,
  };

  if (approvalInfo) {
    response.remainingAdvanceSalary =
      approvalInfo.remainingAdvanceSalary - approvalInfo.requestAmount;
  }

  return res.json(response);
};

const handleDayOffRequestReview = async ({ req, res, status }) => {
  assertAdminOrOwner(req.user);

  const id = assertRequestId(req.params.id);
  const isApprove = status === REQUEST_STATUS.APPROVED;
  const actionText = isApprove ? "approved" : "rejected";

  const dayOffRequest = await prisma.dayOff.findUnique({
    where: { id },
    include: requestInclude,
  });

  assertReviewableRequest(dayOffRequest, "Day-off request not found", actionText);

  const employee = dayOffRequest.employees;
  assertReviewableEmployee(employee, { requirePosition: isApprove });

  // สำคัญ:
  // กรณี 1: ถ้าขอเดือนปัจจุบัน ให้ใช้ remainingDayOffs และ decrement เมื่อ approve
  // กรณี 2: ถ้าขอเดือนอื่น ให้เช็กเฉพาะ APPROVED ของเดือนนั้นก่อน
  //   - ถ้า approvedDayOffInRequestMonth < maxDayOffPerMonth ให้ approve ได้ และไม่ decrement remainingDayOffs
  //   - ถ้า approvedDayOffInRequestMonth >= maxDayOffPerMonth ให้ fallback ไปใช้ remainingDayOffs และ decrement
  //   - ถ้า remainingDayOffs ไม่พอด้วย ให้ approve ไม่ได้
  if (isApprove) {
    const holiday = await isDayOffOnStoreHoliday({
      date: dayOffRequest.date,
      branchId: employee.branchId,
    });

    if (holiday) {
      const canceledRequest = await cancelDayOffBecauseHoliday({
        req,
        dayOffRequest,
        employee,
      });

      return res.status(400).json({
        message: "วันนี้เป็นวันหยุดของสาขานี้ ระบบยกเลิกคำขอลาแล้ว",
        data: canceledRequest,
      });
    }
  }

  const updatedRequest = isApprove
    ? await approveDayOff({ req, dayOffRequest, employee })
    : await rejectDayOff({ req, dayOffRequest, employee });

  await sendDayOffReviewNotification({
    status,
    dayOffRequest,
    employeeId: employee.id,
    createdById: req.user.id,
  });

  return res.json({
    message: isApprove
      ? "Day-off request approved successfully"
      : "Day-off request rejected",
    data: updatedRequest,
  });
};

exports.getPendingRequests = controller("getPendingRequests", async (req, res) => {
  assertAdminOrOwner(req.user);

  const includeHistory = req.query.includeHistory === "true";
  const days = Math.min(
    Math.max(parseInt(req.query.days, 10) || DEFAULT_HISTORY_DAYS, 1),
    MAX_HISTORY_DAYS
  );

  const requestWhere = getRequestWhere({ includeHistory, days });

  const [salaryRequests, dayOffRequests] = await Promise.all([
    prisma.advanceSalary.findMany({
      where: requestWhere,
      include: requestInclude,
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.dayOff.findMany({
      where: requestWhere,
      include: requestInclude,
      orderBy: {
        updatedAt: "desc",
      },
    }),
  ]);

  const data = [
    ...salaryRequests.map(formatSalaryRequest),
    ...dayOffRequests.map(formatDayOffRequest),
  ].sort((a, b) => getRequestSortTime(b) - getRequestSortTime(a));

  return res.json({
    message: "Get requests success",
    data,
  });
});

exports.approveSalaryRequest = controller(
  "approveSalaryRequest",
  async (req, res) => {
    return handleSalaryRequestReview({
      req,
      res,
      status: REQUEST_STATUS.APPROVED,
    });
  }
);

exports.rejectSalaryRequest = controller(
  "rejectSalaryRequest",
  async (req, res) => {
    return handleSalaryRequestReview({
      req,
      res,
      status: REQUEST_STATUS.REJECTED,
    });
  }
);

exports.approveDayOffRequest = controller(
  "approveDayOffRequest",
  async (req, res) => {
    return handleDayOffRequestReview({
      req,
      res,
      status: REQUEST_STATUS.APPROVED,
    });
  }
);

exports.rejectDayOffRequest = controller(
  "rejectDayOffRequest",
  async (req, res) => {
    return handleDayOffRequestReview({
      req,
      res,
      status: REQUEST_STATUS.REJECTED,
    });
  }
);

exports.getEmployeesDashboard = controller(
  "getEmployeesDashboard",
  async (req, res) => {
    assertAdminOrOwner(req.user);

    const { year, month, branchId } = req.query;
    const bangkokNow = getBangkokYearMonth(new Date());

    const dashboardYear = parseInt(year, 10) || bangkokNow.year;
    const dashboardMonth = parseInt(month, 10) || bangkokNow.month;

    const { start: startDate, end: endDate } = getBangkokMonthRange(
      dashboardYear,
      dashboardMonth
    );

    const employeeWhere = {
      ...getActiveEmployeeWhere(),
      branch: {
        is: getActiveBranchWhere(),
      },
    };

    const holidayWhere = {
      ...getActiveStoreHolidayWhere(),
      date: {
        gte: startDate,
        lte: endDate,
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    };

    if (branchId && branchId !== "all") {
      const parsedBranchId = Number(branchId);

      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        throw makeHttpError(400, "Invalid branch id");
      }

      employeeWhere.branchId = parsedBranchId;
      holidayWhere.branchId = parsedBranchId;
    }

    const [holidays, employees] = await Promise.all([
      prisma.storeHoliday.findMany({
        where: holidayWhere,
      }),
      prisma.employees.findMany({
        where: employeeWhere,
        include: {
          branch: true,
          position: {
            include: {
              branch: true,
            },
          },
          timetracking: {
            where: {
              date: {
                gte: startDate,
                lte: endDate,
              },
            },
            include: {
              shift: true,
            },
            orderBy: {
              checkIn: "desc",
            },
          },
          overtimeTrackings: {
            where: {
              date: {
                gte: startDate,
                lte: endDate,
              },
            },
            include: {
              branch: true,
            },
            orderBy: {
              checkIn: "desc",
            },
          },
          dayOff: {
            where: {
              date: {
                gte: startDate,
                lte: endDate,
              },
            },
          },
          advanceSalary: {
            where: {
              requestDate: {
                gte: startDate,
                lte: endDate,
              },
            },
          },
          salaryRecord: {
            where: {
              month: {
                gte: startDate,
                lte: endDate,
              },
            },
          },
        },
        orderBy: {
          firstname: "asc",
        },
      }),
    ]);

    const holidaysByBranchId = new Map();
    const holidayKeysByBranchId = new Map();

    holidays.forEach((holiday) => {
      const branchKey = String(holiday.branchId);
      const dateKey = toBangkokDateKey(holiday.date);

      if (!holidaysByBranchId.has(branchKey)) {
        holidaysByBranchId.set(branchKey, []);
        holidayKeysByBranchId.set(branchKey, new Set());
      }

      holidaysByBranchId.get(branchKey).push(holiday);
      holidayKeysByBranchId.get(branchKey).add(dateKey);
    });

    const todayKey = toBangkokDateKey(new Date());
    const selectedMonthKey = `${dashboardYear}-${String(
      dashboardMonth
    ).padStart(2, "0")}`;
    const currentMonthKey = todayKey.slice(0, 7);

    const getLastDayToCheck = () => {
      if (selectedMonthKey > currentMonthKey) return 0;
      if (selectedMonthKey === currentMonthKey) {
        return Number(todayKey.slice(8, 10));
      }

      return new Date(dashboardYear, dashboardMonth, 0).getDate();
    };

    const lastDayToCheck = getLastDayToCheck();

    const transformedEmployees = employees.map((employee) => {
      const validPosition =
        employee.position &&
        employee.position.isActive &&
        !employee.position.isDeleted &&
        Number(employee.position.branchId) === Number(employee.branchId)
          ? employee.position
          : null;

      const branchKey = String(employee.branchId);
      const employeeHolidays = holidaysByBranchId.get(branchKey) || [];
      const holidayDateKeys = holidayKeysByBranchId.get(branchKey) || new Set();

      const approvedAdvanceSalary = (employee.advanceSalary || []).filter(
        (advance) => advance.status === REQUEST_STATUS.APPROVED
      );

      const advanceTaken = approvedAdvanceSalary.reduce(
        (sum, advance) => sum + Number(advance.amount || 0),
        0
      );

      const salaryRecordForMonth = (employee.salaryRecord || [])[0] || null;
      const attendanceLogs = [];
      const employeeCreatedKey = toBangkokDateKey(employee.createdAt);
      const checkInDateMap = new Map();

      (employee.timetracking || []).forEach((record) => {
        const key = toBangkokDateKey(record.date || record.checkIn);

        if (!checkInDateMap.has(key)) {
          checkInDateMap.set(key, record);
        }

        attendanceLogs.push({
          id: record.id,
          date: key,
          status: "PRESENT",
          timeStatus: record.status || "ACTIVE",
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          shiftId: record.shiftId || null,
          shiftName: record.shiftNameSnapshot || record.shift?.name || null,
          positionIdSnapshot: record.positionIdSnapshot || null,
          positionName: record.positionNameSnapshot || validPosition?.name || null,
          scheduledCheckInTime:
            record.scheduledCheckInTime || record.shift?.checkInTime || null,
          scheduledCheckOutTime:
            record.scheduledCheckOutTime || record.shift?.checkOutTime || null,
          checkInGraceBeforeMinutes:
            record.checkInGraceBeforeMinutesSnapshot ??
            record.shift?.checkInGraceBeforeMinutes ??
            null,
          checkOutGraceAfterMinutes:
            record.checkOutGraceAfterMinutesSnapshot ??
            record.shift?.checkOutGraceAfterMinutes ??
            null,
          branchIdSnapshot: record.branchIdSnapshot || employee.branchId || null,
          branchName: record.branchNameSnapshot || employee.branch?.name || null,
          lateMinutes: record.lateMinutes || 0,
          earlyLeaveMinutes: record.earlyLeaveMinutes || 0,
          checkInNote: record.checkInNote || null,
          checkOutNote: record.checkOutNote || null,
        });
      });

      const overtimeLogs = (employee.overtimeTrackings || []).map((ot) => ({
        id: ot.id,
        date: toBangkokDateKey(ot.date || ot.checkIn),
        checkIn: ot.checkIn,
        checkOut: ot.checkOut,
        noteIn: ot.noteIn || null,
        noteOut: ot.noteOut || null,
        otMinutes: ot.otMinutes || 0,
        status: ot.status,
        branchId: ot.branchId,
        branch:
          ot.branch && ot.branch.isActive && !ot.branch.isDeleted
            ? ot.branch
            : null,
      }));

      const totalOtMinutes = overtimeLogs
        .filter(
          (record) =>
            record.checkIn &&
            record.checkOut &&
            record.status !== "CANCELLED" &&
            record.status !== "EXPIRED"
        )
        .reduce((sum, record) => sum + Number(record.otMinutes || 0), 0);

      const activeOvertime =
        overtimeLogs.find((ot) => ot.status === "ACTIVE" && !ot.checkOut) ||
        null;

      const approvedDayOffMap = new Map();

      (employee.dayOff || [])
        .filter((dayOff) => dayOff.status === REQUEST_STATUS.APPROVED)
        .forEach((dayOff) => {
          const key = toBangkokDateKey(dayOff.date);
          approvedDayOffMap.set(key, dayOff);

          attendanceLogs.push({
            date: key,
            status: "DAY_OFF",
            reason: dayOff.reason || null,
          });
        });

      employeeHolidays.forEach((holiday) => {
        const key = toBangkokDateKey(holiday.date);
        const dayNumber = Number(key.slice(8, 10));

        if (
          key.slice(0, 7) === selectedMonthKey &&
          dayNumber <= lastDayToCheck
        ) {
          attendanceLogs.push({
            date: key,
            status: "HOLIDAY",
            reason: holiday.title || "Store holiday",
          });
        }
      });

      for (let day = 1; day <= lastDayToCheck; day += 1) {
        const dateKey = `${dashboardYear}-${String(dashboardMonth).padStart(
          2,
          "0"
        )}-${String(day).padStart(2, "0")}`;

        if (dateKey < employeeCreatedKey) continue;

        const hasCheckIn = checkInDateMap.has(dateKey);
        const hasDayOff = approvedDayOffMap.has(dateKey);
        const isHoliday = holidayDateKeys.has(dateKey);

        if (!hasCheckIn && !hasDayOff && !isHoliday) {
          attendanceLogs.push({
            date: dateKey,
            status: "ABSENT",
          });
        }
      }

      const absentDays = attendanceLogs.filter(
        (log) => log.status === "ABSENT"
      ).length;

      attendanceLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
      overtimeLogs.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

      return {
        id: employee.id,
        email: employee.email,
        firstname: employee.firstname,
        lastname: employee.lastname,
        profileImage: employee.profileImage,
        role: employee.role,
        isActive: employee.isActive,
        isDeleted: employee.isDeleted,

        branchId: employee.branchId,
        branch: employee.branch,

        positionId: validPosition?.id || null,
        position: validPosition,

        baseSalary: employee.baseSalary || 0,
        remainingDayOffs: validPosition
          ? Number(employee.remainingDayOffs || 0)
          : 0,

        timetracking: employee.timetracking || [],
        overtimeTrackings: employee.overtimeTrackings || [],
        overtimeLogs,
        totalOtMinutes,
        activeOvertime,

        dayOff: employee.dayOff || [],
        dayOffsTaken: employee.dayOff || [],
        advanceSalary: employee.advanceSalary || [],

        attendanceLogs,
        absentDays,
        advanceTaken,

        finalSalary: salaryRecordForMonth
          ? Number(salaryRecordForMonth.finalSalary || 0)
          : Number(employee.baseSalary || 0) - advanceTaken,
      };
    });

    return res.status(200).json(transformedEmployees);
  }
);

exports.getApproveRequestHistory = controller(
  "getApproveRequestHistory",
  async (req, res) => {
    assertAdminOrOwner(req.user);

    const bangkokNow = getBangkokYearMonth(new Date());
    const month = Number(req.query.month) || bangkokNow.month;
    const year = Number(req.query.year) || bangkokNow.year;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || DEFAULT_PAGE_LIMIT, 1),
      MAX_PAGE_LIMIT
    );
    const skip = (page - 1) * limit;

    const { start: monthStart, end: monthEnd } = getBangkokMonthRange(
      year,
      month
    );

    const where = {
      action: {
        in: [REQUEST_ACTION.APPROVE, REQUEST_ACTION.REJECT],
      },
      entity: {
        in: [REQUEST_ENTITY.DAY_OFF, REQUEST_ENTITY.ADVANCE_SALARY],
      },
      createdAt: {
        gte: monthStart,
        lte: monthEnd,
      },
    };

    if (req.query.branchId && req.query.branchId !== "all") {
      const parsedBranchId = Number(req.query.branchId);

      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        throw makeHttpError(400, "Invalid branch id");
      }

      where.branchId = parsedBranchId;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              role: true,
              profileImage: true,
            },
          },
          targetEmployee: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              role: true,
              profileImage: true,
              branchId: true,
              positionId: true,
              branch: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
              position: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const getStatusFromAudit = (log, newValue = {}) => {
      if (newValue.status) return newValue.status;
      if (log.action === REQUEST_ACTION.APPROVE) return REQUEST_STATUS.APPROVED;
      if (log.action === REQUEST_ACTION.REJECT) return REQUEST_STATUS.REJECTED;

      return REQUEST_STATUS.PENDING;
    };

    const data = logs.map((log) => {
      const oldValue = log.oldValue || {};
      const newValue = log.newValue || {};
      const isAdvance = log.entity === REQUEST_ENTITY.ADVANCE_SALARY;
      const isDayOff = log.entity === REQUEST_ENTITY.DAY_OFF;

      return {
        id: log.id,
        auditLogId: log.id,

        action: log.action,
        status: getStatusFromAudit(log, newValue),

        entity: log.entity,
        entityId: log.entityId,
        requestId: log.entityId,

        type: isAdvance ? REQUEST_TYPE.ADVANCE : REQUEST_TYPE.DAY_OFF,
        requestType: isAdvance ? REQUEST_TYPE.ADVANCE : REQUEST_TYPE.DAY_OFF,

        amount:
          isAdvance && newValue.amount !== undefined && newValue.amount !== null
            ? Number(newValue.amount)
            : null,

        requestDate: isAdvance ? newValue.requestDate || null : null,
        date: isDayOff ? newValue.date || null : null,
        reason: isDayOff ? newValue.reason || "" : "",
        cancelReason: newValue.cancelReason || null,

        oldValue,
        newValue,
        note: log.note || "",

        approvedAt: log.createdAt,
        reviewedAt: log.createdAt,
        createdAt: log.createdAt,
        updatedAt: log.createdAt,

        actor: formatEmployee(log.actor),
        reviewer: formatEmployee(log.actor),
        approvedBy: formatEmployee(log.actor),

        employee: formatEmployee(log.targetEmployee),
        employees: formatEmployee(log.targetEmployee),
        targetEmployee: formatEmployee(log.targetEmployee),

        branch: log.branch || log.targetEmployee?.branch || null,
      };
    });

    return res.json({
      message: "Get approve request history success",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  }
);