import errorM from '../utils/errorM'
import Users from '../models/Users'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import nodemailer from 'nodemailer'

const signIn = async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(404).json(errorM('User or password not informed'))
    }
    await Users.findOne({ where: { email } })
        .then(user => {
            if (!user) {
                return res.status(401).json(errorM('User or password incorrect'))
            }
            // Verify password using bcrypt
            bcrypt.compare(password, user.password_hash, (err, result) => {
                if (err) {
                    return res.status(500).json(errorM(err))
                }
                if (!result) {
                    return res.status(401).json(errorM('User or password incorrect'))
                }
                const { id, email } = user
                const token = jwt.sign({ id, email }, 'process.env.SECRET', {
                    expiresIn: '1d'
                })
                return res.json({ token })
            })
        })
        .catch(err => {
            return res.status(500).json(errorM(err))
        })
}

const signUp = async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(404).json(errorM('User or password not informed'))
    } else if (password.length < 6) {
        return res.status(404).json(errorM('Password must be at least 6 characters'))
    }

    await Users.findOne({ where: { email } })
        .then(user => {
            if (user) {
                return res.status(409).json(errorM('User already exists'))
            }
            // Create password using bcrypt
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) {
                    return res.status(500).json(errorM(err))
                }
                Users.create({ email, password_hash: hash })
                    .then(user => {
                        return res.json(user)
                    })
                    .catch(err => {
                        return res.status(400).json(errorM((err.message.split('Validation error: '))[1]))
                    })
            })
        })
        .catch(err => {
            return res.status(500).json(errorM(err))
        })
}

const sendEmail = async (req, res) => {
    const emailForms = req.body.email || null
    if (!emailForms) return res.status(404).send(errorM('Email not sent'))

    // Check if user exists
    const user = await Users.findOne({ where: { email: emailForms } })
    if (!user) {
        return res.status(404).send(errorM('User not found'))
    }

    const code = Math.floor(Math.random() * 99999999)
    const remetente = await nodemailer.createTransport({
        host: "smtp.office365.com", // hostname
        secureConnection: false, // TLS requires secureConnection to be false
        port: 587, // port for secure SMTP
        tls: {
            ciphers: 'SSLv3'
        },
        auth: {
            user: 'login.escola@outlook.com',
            pass: 'Bv759236'
        }
    })

    const email = {
        from: 'login.escola@outlook.com',
        to: emailForms,
        subject: 'Your Code',
        text: `Your code is ${code}`,
    }

    await remetente.sendMail(email, function (error) {
        if (error) {
            console.log(error)
        }
    })

    const token = jwt.sign({ emailForms, code }, 'SendCodeToken', { expiresIn: '1h' }) //TODO: substituir por dotenv e o tempo de espera
    res.status(200).json({ token })
}

const checkCode = async (req, res) => {
    const { authorization } = req.headers;

    if (!authorization) {
        return res.status(404).json(errorM('User did not request the email'));
    }

    const [, token] = authorization.split(' ');


    try {
        const { emailForms, code } = jwt.verify(token, "SendCodeToken") //TODO: replace with dotenv
        if (!code) return res.status(404).json(errorM('User did not request the email'))

        const userCode = req.body.code
        if (!userCode) return res.status(404).json(errorM('Code not sent'))

        if (Number(userCode) === Number(code)) {
            const user = await Users.findOne({ where: { email: emailForms } })
            if (user !== null) {
                const token = jwt.sign({ email: emailForms, id: user.id }, 'ResetPasswordToken', { expiresIn: '1h' }) //TODO: replace with dotenv
                return res.status(200).json({ token })
            }

            return res.status(404).json(errorM('User does not exist!'))
        }
        res.status(401).json(errorM('Invalid Code!'))
    } catch (e) {
        return res.status(401).json(errorM('Expired or invalid token.'));
    }
}

const resetPassword = async (req, res) => {
    const { authorization } = req.headers;

    if (!authorization) {
        return res.status(404).json(errorM('User did not validate the email'));
    }

    const [, token] = authorization.split(' ');

    try {
        const { email, id } = jwt.verify(token, "ResetPasswordToken") //TODO: replace with dotenv
        if (!email || !id) return res.status(404).json(errorM('User did not request the email'))

        const user = await Users.findOne({ where: { email } })
        if (user === null) return res.status(404).json(errorM('User does not exist!'))

        const newPassword = req.body.password
        if (!newPassword) return res.status(404).json(errorM('Password not sent!'))

        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) {
                return res.status(500).json(errorM(err))
            }
            user.password_hash = hash
            user.save()
            return res.status(200).json({ message: 'Password changed successfully!' })
        })
    } catch (e) {
        return res.status(401).json(errorM('Expired or invalid token.'));
    }
}

export {
    signIn,
    signUp,
    sendEmail,
    checkCode,
    resetPassword,
}