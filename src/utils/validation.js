const Joi = require('joi');

// User validation schemas
const registerSchema = Joi.object({
    username: Joi.string()
        .alphanum()
        .min(3)
        .max(20)
        .required()
        .messages({
            'string.alphanum': 'Username must contain only alphanumeric characters',
            'string.min': 'Username must be at least 3 characters long',
            'string.max': 'Username must be at most 20 characters long',
            'any.required': 'Username is required'
        }),
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .min(8)
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])'))
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters long',
            'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
            'any.required': 'Password is required'
        }),
    confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .required()
        .messages({
            'any.only': 'Passwords do not match',
            'any.required': 'Password confirmation is required'
        }),
    firstName: Joi.string()
        .min(2)
        .max(50)
        .optional(),
    lastName: Joi.string()
        .min(2)
        .max(50)
        .optional()
});

const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .required()
        .messages({
            'any.required': 'Password is required'
        })
});

const loginSchemaAdminAccess = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        })
});

// NFT validation schemas
const createNFTSchema = Joi.object({
    name: Joi.string()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.min': 'NFT name is required',
            'string.max': 'NFT name must be at most 100 characters long',
            'any.required': 'NFT name is required'
        }),
    description: Joi.string()
        .max(1000)
        .optional()
        .messages({
            'string.max': 'Description must be at most 1000 characters long'
        }),
    price: Joi.number()
        .min(0)
        .optional()
        .messages({
            'number.min': 'Price must be a positive number'
        }),
    // Auction fields
    isAuction: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'isAuction must be a boolean value'
        }),
    auctionStartPrice: Joi.when('isAuction', {
        is: true,
        then: Joi.number()
            .min(0.001)
            .required()
            .messages({
                'number.min': 'Starting price must be at least 0.001 ETH',
                'any.required': 'Starting price is required for auctions'
            }),
        otherwise: Joi.number()
            .min(0)
            .optional()
    }),
    auctionReservePrice: Joi.number()
        .min(0)
        .optional()
        .messages({
            'number.min': 'Reserve price must be a positive number'
        }),
    auctionEndTime: Joi.when('isAuction', {
        is: true,
        then: Joi.date()
            .greater('now')
            .required()
            .messages({
                'date.greater': 'Auction end time must be in the future',
                'any.required': 'Auction end time is required for auctions'
            }),
        otherwise: Joi.date()
            .optional()
    })
});

const bidSchema = Joi.object({
    amount: Joi.number()
        .min(0.001)
        .required()
        .messages({
            'number.min': 'Bid amount must be at least 0.001 ETH',
            'any.required': 'Bid amount is required'
        })
});

// Password validation helper
const validatePassword = (password, userInfo) => {
    const errors = [];

    // Check if password is too simple
    if (password.toLowerCase().includes(userInfo.email?.toLowerCase().split('@')[0])) {
        errors.push('Password cannot contain your email username');
    }

    if (password.toLowerCase().includes(userInfo.firstName?.toLowerCase())) {
        errors.push('Password cannot contain your first name');
    }

    if (password.toLowerCase().includes(userInfo.lastName?.toLowerCase())) {
        errors.push('Password cannot contain your last name');
    }

    // Check for common passwords
    const commonPasswords = ['password', '123456', 'qwerty', 'abc123', 'password123'];
    if (commonPasswords.includes(password.toLowerCase())) {
        errors.push('Password is too common, please choose a stronger password');
    }

    return errors;
};

// Generate suggested username
const generateSuggestedUsername = (baseUsername) => {
    const randomSuffix = Math.floor(Math.random() * 1000);
    return `${baseUsername}${randomSuffix}`;
};

module.exports = {
    registerSchema,
    loginSchema,
    createNFTSchema,
    bidSchema,
    validatePassword,
    generateSuggestedUsername,
    loginSchemaAdminAccess
};
